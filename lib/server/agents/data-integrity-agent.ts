import "server-only"

import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"
import { finishAgentRun, saveAgentFinding, startAgentRun } from "@/lib/server/agents/agent-store"
import { safeDivide, toNumber } from "@/lib/server/agents/utils"
import { sendAgentAlertEmail } from "@/lib/server/agents/alert-email"
import { sendWhatsAppAlert } from "@/lib/server/whatsapp-alerts"

type IntegritySeverity = "low" | "medium" | "high" | "critical"

type IntegrityFinding = {
  tenantId: string
  tenantName: string
  ruleCode: string
  entityKey: string
  severity: IntegritySeverity
  title: string
  description: string
  details: Record<string, unknown>
}

const DEFAULT_BAG_WEIGHT = 50
const MIN_KGS_FOR_YIELD_SIGNAL = 50
const MIN_BASELINE_WEEKS = 4
const ZSCORE_HIGH = 3
const ZSCORE_MEDIUM = 2
const severityRank: Record<IntegritySeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

const truncate = (value: string, max = 220) => (value.length > max ? `${value.slice(0, max - 1)}…` : value)

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

const isMissingCoreRelation = (error: unknown) =>
  isMissingRelation(error, "processing_records") ||
  isMissingRelation(error, "sales_records") ||
  isMissingRelation(error, "dispatch_records") ||
  isMissingRelation(error, "current_inventory") ||
  isMissingRelation(error, "locations")

const toRows = <T = any>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[]
  const candidate = (value as any)?.rows
  return Array.isArray(candidate) ? (candidate as T[]) : []
}

const clampSeverityFromZScore = (zScore: number): IntegritySeverity => {
  const magnitude = Math.abs(zScore)
  if (magnitude >= 4) return "critical"
  if (magnitude >= ZSCORE_HIGH) return "high"
  if (magnitude >= ZSCORE_MEDIUM) return "medium"
  return "low"
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

async function upsertIntegrityException(finding: IntegrityFinding, runId: string) {
  if (!sql) throw new Error("Database not configured")
  const existingRowsResult = await sql`
    SELECT severity
    FROM data_integrity_exceptions
    WHERE tenant_id = ${finding.tenantId}::uuid
      AND rule_code = ${finding.ruleCode}
      AND entity_key = ${finding.entityKey}
      AND status = 'open'
    LIMIT 1
  `
  const existingRows = toRows<{ severity?: string }>(existingRowsResult)

  if (existingRows.length > 0) {
    const previousSeverityRaw = String(existingRows[0].severity || "medium").toLowerCase() as IntegritySeverity
    const previousSeverity: IntegritySeverity = ["low", "medium", "high", "critical"].includes(previousSeverityRaw)
      ? previousSeverityRaw
      : "medium"

    await sql`
      UPDATE data_integrity_exceptions
      SET
        severity = ${finding.severity},
        status = 'open',
        title = ${finding.title},
        description = ${finding.description},
        details = ${JSON.stringify(finding.details)}::jsonb,
        last_seen_at = NOW(),
        resolved_at = NULL,
        last_run_id = ${runId}::uuid
      WHERE tenant_id = ${finding.tenantId}::uuid
        AND rule_code = ${finding.ruleCode}
        AND entity_key = ${finding.entityKey}
        AND status = 'open'
    `

    return {
      isNew: false,
      escalated: severityRank[finding.severity] > severityRank[previousSeverity],
      previousSeverity,
    }
  }

  await sql`
    INSERT INTO data_integrity_exceptions (
      tenant_id,
      rule_code,
      entity_key,
      severity,
      status,
      title,
      description,
      details,
      last_run_id
    )
    VALUES (
      ${finding.tenantId}::uuid,
      ${finding.ruleCode},
      ${finding.entityKey},
      ${finding.severity},
      'open',
      ${finding.title},
      ${finding.description},
      ${JSON.stringify(finding.details)}::jsonb,
      ${runId}::uuid
    )
  `

  return { isNew: true, escalated: false, previousSeverity: null as IntegritySeverity | null }
}

async function resolveStaleIntegrityExceptions(tenantId: string, runId: string) {
  if (!sql) throw new Error("Database not configured")
  await sql`
    UPDATE data_integrity_exceptions
    SET
      status = 'resolved',
      resolved_at = NOW(),
      last_seen_at = NOW(),
      last_run_id = ${runId}::uuid
    WHERE tenant_id = ${tenantId}::uuid
      AND status = 'open'
      AND (last_run_id IS NULL OR last_run_id <> ${runId}::uuid)
  `
}

async function collectTenantFindings(input: { tenantId: string; tenantName: string; bagWeightKg: number }) {
  if (!sql) throw new Error("Database not configured")
  const tenantContext = normalizeTenantContext(input.tenantId, "owner")
  const findings: IntegrityFinding[] = []

  const [negativeInventoryRowsRaw, processedVsSoldRowsRaw, dispatchMismatchRowsRaw, baselineSignalRowsRaw] = await runTenantQueries(
    sql,
    tenantContext,
    [
      sql.query(
        `
          SELECT
            ci.item_type,
            ci.quantity,
            ci.unit,
            COALESCE(ci.location_id::text, 'tenant') AS location_key,
            COALESCE(l.name, l.code, 'Tenant-wide') AS location_name
          FROM current_inventory ci
          LEFT JOIN locations l ON l.id = ci.location_id
          WHERE ci.tenant_id = $1
            AND ci.quantity < 0
          ORDER BY ci.quantity ASC
          LIMIT 100
        `,
        [input.tenantId],
      ),
      sql.query(
        `
          WITH processed AS (
            SELECT
              COALESCE(SUM(COALESCE(dry_parch, 0) + COALESCE(dry_cherry, 0)), 0) AS processed_kgs
            FROM processing_records
            WHERE tenant_id = $1
              AND process_date >= (CURRENT_DATE - INTERVAL '29 days')
          ),
          dispatched AS (
            SELECT
              COALESCE(
                SUM(
                  COALESCE(
                    NULLIF(kgs_received, 0),
                    bags_dispatched * $2
                  )
                ),
                0
              ) AS dispatch_kgs
            FROM dispatch_records
            WHERE tenant_id = $1
              AND dispatch_date >= (CURRENT_DATE - INTERVAL '29 days')
          ),
          sold AS (
            SELECT
              COALESCE(
                SUM(
                  COALESCE(
                    NULLIF(kgs_received, 0),
                    NULLIF(kgs, 0),
                    NULLIF(weight_kgs, 0),
                    NULLIF(kgs_sent, 0),
                    bags_sold * $2
                  )
                ),
                0
              ) AS sold_kgs
            FROM sales_records
            WHERE tenant_id = $1
              AND sale_date >= (CURRENT_DATE - INTERVAL '29 days')
          )
          SELECT processed.processed_kgs, dispatched.dispatch_kgs, sold.sold_kgs
          FROM processed, dispatched, sold
        `,
        [input.tenantId, input.bagWeightKg],
      ),
      sql.query(
        `
          SELECT
            dr.id::text AS dispatch_id,
            dr.dispatch_date,
            dr.coffee_type,
            dr.bag_type,
            dr.bags_dispatched,
            dr.kgs_received,
            COALESCE(l.name, l.code, dr.estate, 'Unknown') AS location_name,
            (dr.bags_dispatched * $2::numeric) AS expected_kgs
          FROM dispatch_records dr
          LEFT JOIN locations l ON l.id = dr.location_id
          WHERE dr.tenant_id = $1
            AND dr.bags_dispatched > 0
            AND dr.kgs_received IS NOT NULL
            AND dr.kgs_received > (dr.bags_dispatched * $2::numeric * 1.03)
          ORDER BY (dr.kgs_received - dr.bags_dispatched * $2::numeric) DESC
          LIMIT 100
        `,
        [input.tenantId, input.bagWeightKg],
      ),
      sql.query(
        `
          WITH weekly AS (
            SELECT
              pr.location_id,
              pr.coffee_type,
              date_trunc('week', pr.process_date)::date AS week_start,
              COALESCE(SUM(pr.ripe_today), 0) AS ripe_kgs,
              COALESCE(SUM(pr.dry_parch), 0) AS dry_parch_kgs,
              COALESCE(SUM(pr.float_today), 0) AS float_kgs,
              COALESCE(SUM(pr.green_today), 0) AS green_kgs
            FROM processing_records pr
            WHERE pr.tenant_id = $1
              AND pr.process_date >= (CURRENT_DATE - INTERVAL '84 days')
            GROUP BY pr.location_id, pr.coffee_type, week_start
          ),
          baseline AS (
            SELECT
              location_id,
              coffee_type,
              AVG(CASE WHEN ripe_kgs > 0 THEN dry_parch_kgs / ripe_kgs ELSE 0 END) AS avg_yield,
              STDDEV_POP(CASE WHEN ripe_kgs > 0 THEN dry_parch_kgs / ripe_kgs ELSE 0 END) AS std_yield,
              AVG(CASE WHEN (green_kgs + float_kgs) > 0 THEN float_kgs / (green_kgs + float_kgs) ELSE 0 END) AS avg_float_rate,
              STDDEV_POP(CASE WHEN (green_kgs + float_kgs) > 0 THEN float_kgs / (green_kgs + float_kgs) ELSE 0 END) AS std_float_rate,
              COUNT(*)::int AS sample_weeks
            FROM weekly
            WHERE week_start < date_trunc('week', CURRENT_DATE)::date
            GROUP BY location_id, coffee_type
          ),
          current_week AS (
            SELECT
              pr.location_id,
              pr.coffee_type,
              COALESCE(SUM(pr.ripe_today), 0) AS ripe_kgs,
              COALESCE(SUM(pr.dry_parch), 0) AS dry_parch_kgs,
              COALESCE(SUM(pr.float_today), 0) AS float_kgs,
              COALESCE(SUM(pr.green_today), 0) AS green_kgs
            FROM processing_records pr
            WHERE pr.tenant_id = $1
              AND pr.process_date >= (CURRENT_DATE - INTERVAL '6 days')
            GROUP BY pr.location_id, pr.coffee_type
          )
          SELECT
            COALESCE(cw.location_id::text, 'unknown') AS location_key,
            COALESCE(l.name, l.code, 'Unknown') AS location_name,
            cw.coffee_type,
            cw.ripe_kgs,
            cw.dry_parch_kgs,
            cw.float_kgs,
            cw.green_kgs,
            b.avg_yield,
            b.std_yield,
            b.avg_float_rate,
            b.std_float_rate,
            b.sample_weeks
          FROM current_week cw
          LEFT JOIN baseline b
            ON b.location_id = cw.location_id
            AND b.coffee_type = cw.coffee_type
          LEFT JOIN locations l ON l.id = cw.location_id
        `,
        [input.tenantId],
      ),
    ],
  )
  const negativeInventoryRows = toRows<any>(negativeInventoryRowsRaw)
  const processedVsSoldRows = toRows<any>(processedVsSoldRowsRaw)
  const dispatchMismatchRows = toRows<any>(dispatchMismatchRowsRaw)
  const baselineSignalRows = toRows<any>(baselineSignalRowsRaw)

  negativeInventoryRows.forEach((row: any) => {
    const quantity = toNumber(row.quantity)
    findings.push({
      tenantId: input.tenantId,
      tenantName: input.tenantName,
      ruleCode: "negative_inventory",
      entityKey: `${row.location_key}:${String(row.item_type || "item").toLowerCase()}`,
      severity: quantity < -50 ? "high" : "medium",
      title: "Negative inventory balance",
      description: `${row.location_name || "Location"} has ${round2(quantity)} ${row.unit || "kg"} of ${row.item_type || "item"} in current inventory.`,
      details: {
        location: row.location_name || "Location",
        itemType: row.item_type || null,
        quantity: round2(quantity),
        unit: row.unit || null,
      },
    })
  })

  const processedVsSold = processedVsSoldRows[0]
  if (processedVsSold) {
    const processed = toNumber(processedVsSold.processed_kgs)
    const dispatched = toNumber(processedVsSold.dispatch_kgs)
    const sold = toNumber(processedVsSold.sold_kgs)
    const supplySignal = Math.max(processed, dispatched)
    if (sold > supplySignal + 5) {
      const diff = sold - supplySignal
      const severity: IntegritySeverity =
        supplySignal <= 0 ? "medium" : sold > supplySignal * 1.2 ? "high" : "medium"
      findings.push({
        tenantId: input.tenantId,
        tenantName: input.tenantName,
        ruleCode: "processed_less_than_sold_30d",
        entityKey: "estate:30d",
        severity,
        title: "Sales exceed 30-day supply signal",
        description: `Last 30 days sold KGs (${round2(sold)}) exceed supply signal (${round2(supplySignal)}) by ${round2(diff)} KG (processed ${round2(processed)}, dispatched ${round2(dispatched)}).`,
        details: {
          periodDays: 30,
          processedKgs: round2(processed),
          dispatchReceivedKgs: round2(dispatched),
          supplySignalKgs: round2(supplySignal),
          soldKgs: round2(sold),
          diffKgs: round2(diff),
        },
      })
    }
  }

  dispatchMismatchRows.forEach((row: any) => {
    const received = toNumber(row.kgs_received)
    const expected = toNumber(row.expected_kgs)
    const overBy = Math.max(0, received - expected)
    findings.push({
      tenantId: input.tenantId,
      tenantName: input.tenantName,
      ruleCode: "dispatch_received_gt_dispatched",
      entityKey: `dispatch:${row.dispatch_id}`,
      severity: overBy > input.bagWeightKg ? "high" : "medium",
      title: "Dispatch received exceeds dispatched estimate",
      description: `${row.location_name || "Location"} dispatch ${row.dispatch_id} has received ${round2(received)} KG vs expected ${round2(expected)} KG.`,
      details: {
        dispatchId: row.dispatch_id,
        dispatchDate: row.dispatch_date ? String(row.dispatch_date).slice(0, 10) : null,
        location: row.location_name || null,
        coffeeType: row.coffee_type || null,
        bagType: row.bag_type || null,
        bagsDispatched: round2(toNumber(row.bags_dispatched)),
        expectedKgs: round2(expected),
        receivedKgs: round2(received),
        diffKgs: round2(overBy),
      },
    })
  })

  baselineSignalRows.forEach((row: any) => {
    const ripe = toNumber(row.ripe_kgs)
    const dryParch = toNumber(row.dry_parch_kgs)
    const floatKgs = toNumber(row.float_kgs)
    const greenKgs = toNumber(row.green_kgs)
    const sampleWeeks = toNumber(row.sample_weeks)
    if (sampleWeeks < MIN_BASELINE_WEEKS) return

    const currentYield = safeDivide(dryParch, ripe)
    const currentFloatRate = safeDivide(floatKgs, greenKgs + floatKgs)
    const avgYield = toNumber(row.avg_yield)
    const stdYield = toNumber(row.std_yield)
    const avgFloatRate = toNumber(row.avg_float_rate)
    const stdFloatRate = toNumber(row.std_float_rate)
    const location = String(row.location_name || "Unknown")
    const coffeeType = String(row.coffee_type || "Unknown")
    const signalKeyBase = `${row.location_key}:${coffeeType.toLowerCase()}`

    if (ripe >= MIN_KGS_FOR_YIELD_SIGNAL && stdYield > 0) {
      const zYield = (currentYield - avgYield) / stdYield
      if (zYield <= -ZSCORE_MEDIUM) {
        findings.push({
          tenantId: input.tenantId,
          tenantName: input.tenantName,
          ruleCode: "yield_outlier",
          entityKey: `${signalKeyBase}:yield`,
          severity: clampSeverityFromZScore(zYield),
          title: "Yield anomaly detected",
          description: `${location} ${coffeeType} dry parchment yield is ${(currentYield * 100).toFixed(1)}% vs baseline ${(avgYield * 100).toFixed(1)}%.`,
          details: {
            location,
            coffeeType,
            sampleWeeks,
            currentYield: round2(currentYield),
            baselineYield: round2(avgYield),
            zScore: round2(zYield),
          },
        })
      }
    }

    const floatDen = greenKgs + floatKgs
    if (floatDen >= MIN_KGS_FOR_YIELD_SIGNAL && stdFloatRate > 0) {
      const zFloat = (currentFloatRate - avgFloatRate) / stdFloatRate
      if (zFloat >= ZSCORE_MEDIUM) {
        findings.push({
          tenantId: input.tenantId,
          tenantName: input.tenantName,
          ruleCode: "float_rate_outlier",
          entityKey: `${signalKeyBase}:float`,
          severity: clampSeverityFromZScore(zFloat),
          title: "Float rate spike detected",
          description: `${location} ${coffeeType} float rate is ${(currentFloatRate * 100).toFixed(1)}% vs baseline ${(avgFloatRate * 100).toFixed(1)}%.`,
          details: {
            location,
            coffeeType,
            sampleWeeks,
            currentFloatRate: round2(currentFloatRate),
            baselineFloatRate: round2(avgFloatRate),
            zScore: round2(zFloat),
          },
        })
      }
    }
  })

  return findings
}

export async function runDataIntegrityAgent(input?: {
  triggerSource?: string
  dryRun?: boolean
  tenantId?: string | null
}) {
  if (!sql) throw new Error("Database not configured")
  const dryRun = Boolean(input?.dryRun)
  const runId = dryRun
    ? "dry-run"
    : await startAgentRun({
        agentName: "data-integrity-agent",
        triggerSource: input?.triggerSource || "manual",
        tenantScope: input?.tenantId ? "single-tenant" : "all",
        metadata: { dryRun, tenantId: input?.tenantId || null },
      })

  try {
    const tenantRows = input?.tenantId
      ? await sql`
          SELECT id, name, bag_weight_kg
          FROM tenants
          WHERE id = ${input.tenantId}::uuid
          LIMIT 1
        `
      : await sql`
          SELECT id, name, bag_weight_kg
          FROM tenants
          ORDER BY created_at ASC
        `

    const tenants = toRows<any>(tenantRows).map((row: any) => ({
      id: String(row.id),
      name: String(row.name || "Tenant"),
      bagWeightKg: toNumber(row.bag_weight_kg) || DEFAULT_BAG_WEIGHT,
    }))

    const findings: IntegrityFinding[] = []
    const arisingFindings: Array<IntegrityFinding & { changeType: "new" | "escalated"; previousSeverity: IntegritySeverity | null }> = []
    const tenantSummaries: Array<{ tenantId: string; tenantName: string; findingCount: number }> = []

    for (const tenant of tenants) {
      let tenantFindings: IntegrityFinding[] = []
      try {
        tenantFindings = await collectTenantFindings({
          tenantId: tenant.id,
          tenantName: tenant.name,
          bagWeightKg: tenant.bagWeightKg,
        })
      } catch (error) {
        if (!isMissingCoreRelation(error)) {
          throw error
        }
        tenantFindings = []
      }

      findings.push(...tenantFindings)
      tenantSummaries.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        findingCount: tenantFindings.length,
      })

      if (!dryRun) {
        for (const finding of tenantFindings) {
          const change = await upsertIntegrityException(finding, runId)
          if (change.isNew || change.escalated) {
            arisingFindings.push({
              ...finding,
              changeType: change.isNew ? "new" : "escalated",
              previousSeverity: change.previousSeverity,
            })
          }
          await saveAgentFinding({
            runId,
            tenantId: finding.tenantId,
            findingType: "data_integrity",
            findingKey: `${finding.ruleCode}:${finding.entityKey}`,
            severity: finding.severity,
            title: finding.title,
            description: finding.description,
            payload: finding.details,
          })
        }
        await resolveStaleIntegrityExceptions(tenant.id, runId)
      }
    }

    const summary = {
      dryRun,
      tenantCount: tenants.length,
      findingCount: findings.length,
      arisingFindingCount: arisingFindings.length,
      bySeverity: {
        low: findings.filter((item) => item.severity === "low").length,
        medium: findings.filter((item) => item.severity === "medium").length,
        high: findings.filter((item) => item.severity === "high").length,
        critical: findings.filter((item) => item.severity === "critical").length,
      },
      tenants: tenantSummaries,
    } as Record<string, any>

    if (!dryRun && arisingFindings.length > 0) {
      const topItems = arisingFindings
        .sort((a, b) => severityRank[b.severity] - severityRank[a.severity])
        .slice(0, 20)

      const lines = topItems.map((finding) => {
        const scope = `${finding.tenantName} | ${finding.ruleCode} | ${finding.entityKey}`
        const status =
          finding.changeType === "new"
            ? `[NEW ${finding.severity.toUpperCase()}]`
            : `[ESCALATED ${String(finding.previousSeverity || "medium").toUpperCase()} -> ${finding.severity.toUpperCase()}]`
        return `${status} ${scope} :: ${truncate(finding.description)}`
      })

      const text = [
        `FarmFlow Data Integrity Agent detected ${arisingFindings.length} new/escalated exception(s).`,
        `Run ID: ${runId}`,
        `Total findings this run: ${findings.length}`,
        "",
        ...lines,
      ].join("\n")

      const emailResult = await sendAgentAlertEmail({
        subject: `[FarmFlow] Data Integrity Alerts (${arisingFindings.length})`,
        text,
      })
      summary.emailNotification = emailResult
      const whatsappResult = await sendWhatsAppAlert({ text })
      summary.whatsAppNotification = whatsappResult
    } else {
      summary.emailNotification = {
        sent: false,
        provider: "none",
        reason: dryRun ? "dry-run" : "no new or escalated findings",
      }
      summary.whatsAppNotification = {
        sent: false,
        provider: "none",
        reason: dryRun ? "dry-run" : "no new or escalated findings",
      }
    }

    if (!dryRun) {
      await finishAgentRun({
        runId,
        status: "success",
        summary,
      })
    }

    return { runId, summary, findings }
  } catch (error) {
    if (!dryRun) {
      await finishAgentRun({
        runId,
        status: "failed",
        summary: { error: String((error as Error)?.message || error) },
      })
    }
    throw error
  }
}
