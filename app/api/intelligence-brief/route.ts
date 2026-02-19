import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { getEnabledModules, isModuleAccessError, requireAnyModuleAccess } from "@/lib/server/module-access"

export const dynamic = "force-dynamic"
export const revalidate = 0

type ModuleAction = {
  label: string
  tab: string
}

type ReconciliationSlot = {
  coffeeType: string
  bagType: string
  receivedKgs: number
  soldKgs: number
  saleableKgs: number
  overdrawnKgs: number
}

type CodePattern = {
  code: string
  reference: string
  totalAmount: number
  entryCount: number
  avgAmount: number
  laborAmount: number
  expenseAmount: number
}

type DayPattern = {
  date: string
  totalAmount: number
  entryCount: number
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000

const isMissingRelationError = (error: unknown) => {
  const code = String((error as any)?.code || "")
  const message = String((error as any)?.message || "")
  return code === "42P01" || message.includes("does not exist")
}

const toDateOrNull = (value: string | null) => {
  if (!value || !DATE_PATTERN.test(value)) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10)

const asNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const canonicalCoffeeType = (value: string | null | undefined) => {
  const normalized = String(value || "").toLowerCase().trim()
  if (normalized.includes("arab")) return "Arabica"
  if (normalized.includes("rob")) return "Robusta"
  return "Other"
}

const canonicalBagType = (value: string | null | undefined) => {
  const normalized = String(value || "").toLowerCase().trim()
  if (normalized.includes("cherry")) return "Dry Cherry"
  if (normalized.includes("parchment")) return "Dry Parchment"
  return "Other"
}

const pctDelta = (current: number, previous: number) => {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

export async function GET(request: Request) {
  try {
    const scopedUser = await requireAnyModuleAccess(["inventory", "processing", "dispatch", "sales", "accounts", "season"])
    const enabledModules = await getEnabledModules(scopedUser)
    const isScopedUser = String(scopedUser.role || "").toLowerCase() === "user"
    const tenantContext = normalizeTenantContext(scopedUser.tenantId, scopedUser.role)
    const { searchParams } = new URL(request.url)

    const currentFY = getCurrentFiscalYear()
    const inputStartDate = searchParams.get("startDate")
    const inputEndDate = searchParams.get("endDate")
    const startDate = toDateOrNull(inputStartDate) || new Date(`${currentFY.startDate}T00:00:00Z`)
    const endDate = toDateOrNull(inputEndDate) || new Date(`${currentFY.endDate}T00:00:00Z`)
    const safeStart = startDate <= endDate ? startDate : endDate
    const safeEnd = startDate <= endDate ? endDate : startDate
    const startDateIso = toIsoDate(safeStart)
    const endDateIso = toIsoDate(safeEnd)

    let bagWeightKg = 50
    try {
      const rows = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT bag_weight_kg
          FROM tenants
          WHERE id = ${tenantContext.tenantId}
          LIMIT 1
        `,
      )
      bagWeightKg = asNumber(rows?.[0]?.bag_weight_kg) || 50
    } catch {
      bagWeightKg = 50
    }

    let reconciliation: {
      totalReceivedKgs: number
      totalSoldKgs: number
      saleableKgs: number
      overdrawnKgs: number
      overdrawnSlots: ReconciliationSlot[]
      slots: ReconciliationSlot[]
    } | null = null

    const canAnalyzeDispatchSales = !isScopedUser && (enabledModules.includes("dispatch") || enabledModules.includes("sales"))
    if (canAnalyzeDispatchSales) {
      try {
        const [dispatchRows, salesRows] = await runTenantQueries(sql, tenantContext, [
          sql`
            SELECT
              coffee_type,
              bag_type,
              COALESCE(SUM(COALESCE(NULLIF(kgs_received, 0), bags_dispatched * ${bagWeightKg})), 0) AS received_kgs
            FROM dispatch_records
            WHERE tenant_id = ${tenantContext.tenantId}
              AND dispatch_date >= ${startDateIso}::date
              AND dispatch_date <= ${endDateIso}::date
            GROUP BY 1, 2
          `,
          sql`
            SELECT
              coffee_type,
              bag_type,
              COALESCE(SUM(COALESCE(NULLIF(kgs_received, 0), NULLIF(kgs, 0), bags_sold * ${bagWeightKg})), 0) AS sold_kgs
            FROM sales_records
            WHERE tenant_id = ${tenantContext.tenantId}
              AND sale_date >= ${startDateIso}::date
              AND sale_date <= ${endDateIso}::date
            GROUP BY 1, 2
          `,
        ])

        const slotMap = new Map<string, ReconciliationSlot>()
        for (const row of dispatchRows || []) {
          const coffeeType = canonicalCoffeeType(row?.coffee_type)
          const bagType = canonicalBagType(row?.bag_type)
          const key = `${coffeeType}|${bagType}`
          const current = slotMap.get(key) || {
            coffeeType,
            bagType,
            receivedKgs: 0,
            soldKgs: 0,
            saleableKgs: 0,
            overdrawnKgs: 0,
          }
          current.receivedKgs += asNumber(row?.received_kgs)
          slotMap.set(key, current)
        }
        for (const row of salesRows || []) {
          const coffeeType = canonicalCoffeeType(row?.coffee_type)
          const bagType = canonicalBagType(row?.bag_type)
          const key = `${coffeeType}|${bagType}`
          const current = slotMap.get(key) || {
            coffeeType,
            bagType,
            receivedKgs: 0,
            soldKgs: 0,
            saleableKgs: 0,
            overdrawnKgs: 0,
          }
          current.soldKgs += asNumber(row?.sold_kgs)
          slotMap.set(key, current)
        }

        const slots = Array.from(slotMap.values()).map((slot) => {
          const netKgs = slot.receivedKgs - slot.soldKgs
          return {
            ...slot,
            saleableKgs: Math.max(0, netKgs),
            overdrawnKgs: Math.max(0, -netKgs),
          }
        })

        const totalReceivedKgs = slots.reduce((sum, slot) => sum + slot.receivedKgs, 0)
        const totalSoldKgs = slots.reduce((sum, slot) => sum + slot.soldKgs, 0)
        const overdrawnSlots = slots
          .filter((slot) => slot.overdrawnKgs > 0)
          .sort((a, b) => b.overdrawnKgs - a.overdrawnKgs)
        reconciliation = {
          totalReceivedKgs,
          totalSoldKgs,
          saleableKgs: Math.max(0, totalReceivedKgs - totalSoldKgs),
          overdrawnKgs: Math.max(0, totalSoldKgs - totalReceivedKgs),
          overdrawnSlots,
          slots: slots.sort((a, b) => b.receivedKgs - a.receivedKgs),
        }
      } catch (error) {
        if (!isMissingRelationError(error)) {
          throw error
        }
        reconciliation = null
      }
    }

    let accountsPatterns: {
      totalLabor: number
      totalExpenses: number
      totalSpend: number
      laborSharePct: number
      expenseSharePct: number
      topCostCodes: CodePattern[]
      mostFrequentCodes: CodePattern[]
      highestLaborDays: DayPattern[]
      highestExpenseDays: DayPattern[]
      laborTrendPct: number | null
      expenseTrendPct: number | null
      topLaborEntry: { date: string; code: string; amount: number; notes: string } | null
      topExpenseEntry: { date: string; code: string; amount: number; notes: string } | null
    } | null = null

    if (enabledModules.includes("accounts")) {
      try {
        const recentStartIso = toIsoDate(new Date(safeEnd.getTime() - 29 * DAY_MS))
        const previousStartIso = toIsoDate(new Date(safeEnd.getTime() - 59 * DAY_MS))
        const previousEndIso = toIsoDate(new Date(safeEnd.getTime() - 30 * DAY_MS))

        const [
          laborByCodeRows,
          expenseByCodeRows,
          activityRows,
          laborByDayRows,
          expenseByDayRows,
          laborTrendRows,
          expenseTrendRows,
          topLaborRows,
          topExpenseRows,
        ] = await runTenantQueries(sql, tenantContext, [
          sql`
            SELECT
              code,
              COALESCE(SUM(total_cost), 0) AS total_amount,
              COUNT(*)::int AS entry_count
            FROM labor_transactions
            WHERE tenant_id = ${tenantContext.tenantId}
              AND deployment_date >= ${startDateIso}::date
              AND deployment_date <= ${endDateIso}::date
            GROUP BY code
          `,
          sql`
            SELECT
              code,
              COALESCE(SUM(total_amount), 0) AS total_amount,
              COUNT(*)::int AS entry_count
            FROM expense_transactions
            WHERE tenant_id = ${tenantContext.tenantId}
              AND entry_date >= ${startDateIso}::date
              AND entry_date <= ${endDateIso}::date
            GROUP BY code
          `,
          sql`
            SELECT code, activity
            FROM account_activities
            WHERE tenant_id = ${tenantContext.tenantId}
          `,
          sql`
            SELECT
              deployment_date::date AS day,
              COALESCE(SUM(total_cost), 0) AS total_amount,
              COUNT(*)::int AS entry_count
            FROM labor_transactions
            WHERE tenant_id = ${tenantContext.tenantId}
              AND deployment_date >= ${startDateIso}::date
              AND deployment_date <= ${endDateIso}::date
            GROUP BY deployment_date::date
            ORDER BY total_amount DESC
            LIMIT 3
          `,
          sql`
            SELECT
              entry_date::date AS day,
              COALESCE(SUM(total_amount), 0) AS total_amount,
              COUNT(*)::int AS entry_count
            FROM expense_transactions
            WHERE tenant_id = ${tenantContext.tenantId}
              AND entry_date >= ${startDateIso}::date
              AND entry_date <= ${endDateIso}::date
            GROUP BY entry_date::date
            ORDER BY total_amount DESC
            LIMIT 3
          `,
          sql`
            SELECT
              COALESCE(
                SUM(
                  CASE
                    WHEN deployment_date >= ${recentStartIso}::date AND deployment_date <= ${endDateIso}::date
                      THEN total_cost
                    ELSE 0
                  END
                ),
                0
              ) AS recent_total,
              COALESCE(
                SUM(
                  CASE
                    WHEN deployment_date >= ${previousStartIso}::date AND deployment_date <= ${previousEndIso}::date
                      THEN total_cost
                    ELSE 0
                  END
                ),
                0
              ) AS previous_total
            FROM labor_transactions
            WHERE tenant_id = ${tenantContext.tenantId}
          `,
          sql`
            SELECT
              COALESCE(
                SUM(
                  CASE
                    WHEN entry_date >= ${recentStartIso}::date AND entry_date <= ${endDateIso}::date
                      THEN total_amount
                    ELSE 0
                  END
                ),
                0
              ) AS recent_total,
              COALESCE(
                SUM(
                  CASE
                    WHEN entry_date >= ${previousStartIso}::date AND entry_date <= ${previousEndIso}::date
                      THEN total_amount
                    ELSE 0
                  END
                ),
                0
              ) AS previous_total
            FROM expense_transactions
            WHERE tenant_id = ${tenantContext.tenantId}
          `,
          sql`
            SELECT deployment_date::date AS day, code, total_cost, notes
            FROM labor_transactions
            WHERE tenant_id = ${tenantContext.tenantId}
              AND deployment_date >= ${startDateIso}::date
              AND deployment_date <= ${endDateIso}::date
            ORDER BY total_cost DESC
            LIMIT 1
          `,
          sql`
            SELECT entry_date::date AS day, code, total_amount, notes
            FROM expense_transactions
            WHERE tenant_id = ${tenantContext.tenantId}
              AND entry_date >= ${startDateIso}::date
              AND entry_date <= ${endDateIso}::date
            ORDER BY total_amount DESC
            LIMIT 1
          `,
        ])

        const referenceMap = new Map<string, string>()
        for (const row of activityRows || []) {
          const code = String(row?.code || "").trim()
          if (!code) continue
          referenceMap.set(code, String(row?.activity || code))
        }

        const combinedMap = new Map<string, CodePattern>()
        for (const row of laborByCodeRows || []) {
          const code = String(row?.code || "").trim()
          if (!code) continue
          const current = combinedMap.get(code) || {
            code,
            reference: referenceMap.get(code) || code,
            totalAmount: 0,
            entryCount: 0,
            avgAmount: 0,
            laborAmount: 0,
            expenseAmount: 0,
          }
          current.totalAmount += asNumber(row?.total_amount)
          current.entryCount += asNumber(row?.entry_count)
          current.laborAmount += asNumber(row?.total_amount)
          combinedMap.set(code, current)
        }
        for (const row of expenseByCodeRows || []) {
          const code = String(row?.code || "").trim()
          if (!code) continue
          const current = combinedMap.get(code) || {
            code,
            reference: referenceMap.get(code) || code,
            totalAmount: 0,
            entryCount: 0,
            avgAmount: 0,
            laborAmount: 0,
            expenseAmount: 0,
          }
          current.totalAmount += asNumber(row?.total_amount)
          current.entryCount += asNumber(row?.entry_count)
          current.expenseAmount += asNumber(row?.total_amount)
          combinedMap.set(code, current)
        }

        const combinedCodes = Array.from(combinedMap.values()).map((row) => ({
          ...row,
          avgAmount: row.entryCount > 0 ? row.totalAmount / row.entryCount : 0,
        }))
        const topCostCodes = [...combinedCodes]
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, 5)
        const mostFrequentCodes = [...combinedCodes]
          .sort((a, b) => b.entryCount - a.entryCount || b.totalAmount - a.totalAmount)
          .slice(0, 5)

        const highestLaborDays = (laborByDayRows || []).map((row) => ({
          date: String(row?.day || ""),
          totalAmount: asNumber(row?.total_amount),
          entryCount: asNumber(row?.entry_count),
        }))
        const highestExpenseDays = (expenseByDayRows || []).map((row) => ({
          date: String(row?.day || ""),
          totalAmount: asNumber(row?.total_amount),
          entryCount: asNumber(row?.entry_count),
        }))

        const totalLabor = (laborByCodeRows || []).reduce((sum, row) => sum + asNumber(row?.total_amount), 0)
        const totalExpenses = (expenseByCodeRows || []).reduce((sum, row) => sum + asNumber(row?.total_amount), 0)
        const totalSpend = totalLabor + totalExpenses
        const laborSharePct = totalSpend > 0 ? (totalLabor / totalSpend) * 100 : 0
        const expenseSharePct = totalSpend > 0 ? (totalExpenses / totalSpend) * 100 : 0

        const laborRecent = asNumber(laborTrendRows?.[0]?.recent_total)
        const laborPrevious = asNumber(laborTrendRows?.[0]?.previous_total)
        const expenseRecent = asNumber(expenseTrendRows?.[0]?.recent_total)
        const expensePrevious = asNumber(expenseTrendRows?.[0]?.previous_total)

        const topLaborEntryRow = topLaborRows?.[0]
        const topExpenseEntryRow = topExpenseRows?.[0]

        accountsPatterns = {
          totalLabor,
          totalExpenses,
          totalSpend,
          laborSharePct,
          expenseSharePct,
          topCostCodes,
          mostFrequentCodes,
          highestLaborDays,
          highestExpenseDays,
          laborTrendPct: pctDelta(laborRecent, laborPrevious),
          expenseTrendPct: pctDelta(expenseRecent, expensePrevious),
          topLaborEntry: topLaborEntryRow
            ? {
                date: String(topLaborEntryRow.day || ""),
                code: String(topLaborEntryRow.code || ""),
                amount: asNumber(topLaborEntryRow.total_cost),
                notes: String(topLaborEntryRow.notes || ""),
              }
            : null,
          topExpenseEntry: topExpenseEntryRow
            ? {
                date: String(topExpenseEntryRow.day || ""),
                code: String(topExpenseEntryRow.code || ""),
                amount: asNumber(topExpenseEntryRow.total_amount),
                notes: String(topExpenseEntryRow.notes || ""),
              }
            : null,
        }
      } catch (error) {
        if (!isMissingRelationError(error)) {
          throw error
        }
        accountsPatterns = null
      }
    }

    const highlights: string[] = []
    const actions: ModuleAction[] = []

    if (reconciliation) {
      if (reconciliation.overdrawnKgs > 0) {
        highlights.push(
          `Overdrawn by ${Math.round(reconciliation.overdrawnKgs).toLocaleString()} KGs across ${reconciliation.overdrawnSlots.length} coffee slots.`,
        )
      } else {
        highlights.push(
          `Saleable coffee is ${Math.round(reconciliation.saleableKgs).toLocaleString()} KGs (${Math.round(reconciliation.totalReceivedKgs).toLocaleString()} received - ${Math.round(reconciliation.totalSoldKgs).toLocaleString()} sold).`,
        )
      }
      if (reconciliation.overdrawnSlots[0]) {
        const slot = reconciliation.overdrawnSlots[0]
        highlights.push(
          `Largest mismatch: ${slot.coffeeType} ${slot.bagType} is overdrawn by ${Math.round(slot.overdrawnKgs).toLocaleString()} KGs.`,
        )
      }
      if (enabledModules.includes("dispatch")) {
        actions.push({ label: "Reconcile Dispatch", tab: "dispatch" })
      }
      if (enabledModules.includes("sales")) {
        actions.push({ label: "Review Sales Guardrails", tab: "sales" })
      }
    }

    if (accountsPatterns) {
      const highestCostCode = accountsPatterns.topCostCodes[0]
      const mostFrequentCode = accountsPatterns.mostFrequentCodes[0]
      const highestLaborDay = accountsPatterns.highestLaborDays[0]
      const highestExpenseDay = accountsPatterns.highestExpenseDays[0]

      if (highestCostCode) {
        highlights.push(
          `Highest cost code is ${highestCostCode.code} (${highestCostCode.reference}) at ₹${Math.round(highestCostCode.totalAmount).toLocaleString()} in this period.`,
        )
      }
      if (mostFrequentCode) {
        highlights.push(
          `Most frequent code is ${mostFrequentCode.code} (${mostFrequentCode.reference}) with ${mostFrequentCode.entryCount} entries.`,
        )
      }
      if (highestLaborDay) {
        highlights.push(
          `Labor peak day: ${highestLaborDay.date} with ₹${Math.round(highestLaborDay.totalAmount).toLocaleString()} across ${highestLaborDay.entryCount} entries.`,
        )
      }
      if (highestExpenseDay) {
        highlights.push(
          `Other expense peak day: ${highestExpenseDay.date} with ₹${Math.round(highestExpenseDay.totalAmount).toLocaleString()} across ${highestExpenseDay.entryCount} entries.`,
        )
      }
      if (enabledModules.includes("accounts")) {
        actions.push({ label: "Open Accounts", tab: "accounts" })
      }
    }

    if (enabledModules.includes("activity-log")) {
      actions.push({ label: "Open Activity Log", tab: "activity-log" })
    }

    return NextResponse.json({
      success: true,
      dateRange: {
        startDate: startDateIso,
        endDate: endDateIso,
      },
      generatedAt: new Date().toISOString(),
      highlights,
      actions: actions.slice(0, 4),
      reconciliation,
      accountsPatterns,
    })
  } catch (error) {
    console.error("Error generating intelligence brief:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
