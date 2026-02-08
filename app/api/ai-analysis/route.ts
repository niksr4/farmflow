import { sql } from "@/lib/server/db"
import { getFiscalYearDateRange, getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"

type TenantContext = ReturnType<typeof normalizeTenantContext>

export async function POST(req: Request) {
  try {
    const sessionUser = await requireModuleAccess("ai-analysis")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const rateLimit = await checkRateLimit("aiAnalysis", sessionUser.tenantId)
    const rateHeaders = buildRateLimitHeaders(rateLimit)
    if (!rateLimit.success) {
      return Response.json({ success: false, error: "Rate limit exceeded" }, { status: 429, headers: rateHeaders })
    }
    const { inventory, transactions } = await req.json()

    const fiscalYear = getCurrentFiscalYear()
    const { startDate, endDate } = getFiscalYearDateRange(fiscalYear)

    const [
      laborData,
      processingData,
      rainfallData,
      expenseData,
      dispatchData,
      salesData,
      transactionHistory,
    ] = await Promise.all([
      fetchLaborData(startDate, endDate, tenantContext),
      fetchProcessingData(startDate, endDate, tenantContext),
      fetchRainfallData(tenantContext),
      fetchExpenseData(startDate, endDate, tenantContext),
      fetchDispatchData(startDate, endDate, tenantContext),
      fetchSalesData(startDate, endDate, tenantContext),
      fetchTransactionHistory(startDate, endDate, tenantContext),
    ])

    const dataSummary = buildDataSummary({
      inventory,
      transactions,
      laborData,
      processingData,
      rainfallData,
      expenseData,
      dispatchData,
      salesData,
      fiscalYear: fiscalYear.label,
      transactionHistory,
    })

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "You are an expert agricultural business analyst for a multi-estate coffee and pepper operation in India. Provide detailed, actionable insights based on the data provided.",
          },
          {
            role: "user",
            content: `Analyze the following data from the FarmFlow operations system and provide actionable insights.

${dataSummary}

Please provide a comprehensive analysis covering:

0. **Transaction Patterns (priority)**: Focus on transaction history trends, volumes, and costs. Use current inventory only as a secondary snapshot.

1. **Inventory Insights**: Analyze stock levels, consumption patterns, and restocking needs. Identify items that may need attention.

2. **Processing Performance**: Evaluate coffee processing efficiency across locations and coffee types. Compare yields, dry parchment vs dry cherry output, and identify any anomalies or trends.

3. **Labor & Cost Analysis**: Review labor deployment patterns - estate workers vs outside workers, cost per day, and activity distribution. Identify opportunities for cost optimization and labor efficiency.

4. **Weather Impact**: If rainfall data is available, correlate it with processing activities and suggest optimal timing for various operations.

5. **Cross-Tab Patterns**: Identify connections between different data points (e.g., labor costs vs processing output, inventory consumption vs processing volume, rainfall vs labor deployment).

6. **Recommendations**: Provide 3-5 specific, actionable recommendations to improve operations, reduce costs, and increase efficiency.

Format your response with clear sections using markdown headers (##). Keep the tone professional but accessible. Be specific with numbers and percentages where data allows.`,
          },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    })

    if (!groqResponse.ok) {
      const errorData = await groqResponse.json()
      throw new Error(errorData.error?.message || "Groq API request failed")
    }

    const groqData = await groqResponse.json()
    const analysisText = groqData.choices?.[0]?.message?.content || "No analysis generated"

    return Response.json({
      success: true,
      analysis: analysisText,
    }, { headers: rateHeaders })
  } catch (error) {
    console.error("AI Analysis error:", error)
    if (isModuleAccessError(error)) {
      return Response.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to generate analysis" },
      { status: 500 },
    )
  }
}

async function fetchLaborData(startDate: string, endDate: string, tenantContext: TenantContext) {
  try {
    const tenantId = tenantContext.tenantId
    return await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT 
          deployment_date,
          hf_laborers,
          hf_cost_per_laborer,
          outside_laborers,
          outside_cost_per_laborer,
          total_cost,
          code,
          notes
        FROM labor_transactions
        WHERE deployment_date >= ${startDate} AND deployment_date <= ${endDate}
          AND tenant_id = ${tenantId}
        ORDER BY deployment_date DESC
        LIMIT 100
      `,
    )
  } catch (error) {
    console.error("Error fetching labor data:", error)
    return []
  }
}

async function fetchProcessingData(startDate: string, endDate: string, tenantContext: TenantContext) {
  try {
    const tenantId = tenantContext.tenantId
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT 
          pr.process_date,
          pr.crop_today,
          pr.ripe_today,
          pr.green_today,
          pr.float_today,
          pr.wet_parchment,
          pr.dry_parch,
          pr.dry_cherry,
          pr.dry_p_bags,
          pr.dry_cherry_bags,
          pr.dry_p_bags_todate,
          pr.dry_cherry_bags_todate,
          pr.coffee_type,
          l.name as location_name
        FROM processing_records pr
        JOIN locations l ON l.id = pr.location_id
        WHERE pr.process_date >= ${startDate}::date AND pr.process_date <= ${endDate}::date
          AND pr.tenant_id = ${tenantId}
        ORDER BY pr.process_date DESC
        LIMIT 500
      `,
    )

    const grouped: Record<string, typeof rows> = {}
    for (const row of rows) {
      const key = `${row.location_name} ${row.coffee_type}`.trim()
      if (!grouped[key]) {
        grouped[key] = []
      }
      grouped[key].push(row)
    }
    return grouped
  } catch (error) {
    console.error("Error fetching processing data:", error)
    return {}
  }
}

async function fetchRainfallData(tenantContext: TenantContext) {
  try {
    const currentYear = new Date().getFullYear()
    const tenantId = tenantContext.tenantId
    return await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT 
          record_date,
          inches,
          cents
        FROM rainfall_records
        WHERE EXTRACT(YEAR FROM record_date) = ${currentYear}
          AND tenant_id = ${tenantId}
        ORDER BY record_date DESC
        LIMIT 365
      `,
    )
  } catch (error) {
    console.error("Error fetching rainfall data:", error)
    return []
  }
}

async function fetchExpenseData(startDate: string, endDate: string, tenantContext: TenantContext) {
  try {
    const tenantId = tenantContext.tenantId
    return await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT 
          entry_date,
          code,
          total_amount,
          notes
        FROM expense_transactions
        WHERE entry_date >= ${startDate} AND entry_date <= ${endDate}
          AND tenant_id = ${tenantId}
        ORDER BY entry_date DESC
        LIMIT 100
      `,
    )
  } catch (error) {
    console.error("Error fetching expense data:", error)
    return []
  }
}

async function fetchDispatchData(startDate: string, endDate: string, tenantContext: TenantContext) {
  try {
    const tenantId = tenantContext.tenantId
    return await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT 
          dr.dispatch_date,
          COALESCE(l.name, l.code, dr.estate, 'Unknown') AS location,
          dr.coffee_type,
          dr.bag_type,
          dr.bags_dispatched
        FROM dispatch_records dr
        LEFT JOIN locations l ON l.id = dr.location_id
        WHERE dr.dispatch_date >= ${startDate} AND dr.dispatch_date <= ${endDate}
          AND dr.tenant_id = ${tenantId}
        ORDER BY dr.dispatch_date DESC
        LIMIT 200
      `,
    )
  } catch (error) {
    console.error("Error fetching dispatch data:", error)
    return []
  }
}

async function fetchSalesData(startDate: string, endDate: string, tenantContext: TenantContext) {
  try {
    const tenantId = tenantContext.tenantId
    return await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT 
          sale_date,
          coffee_type,
          bag_type,
          kgs as weight_kgs,
          price_per_bag as price_per_kg,
          revenue as total_revenue,
          buyer_name
        FROM sales_records
        WHERE sale_date >= ${startDate} AND sale_date <= ${endDate}
          AND tenant_id = ${tenantId}
        ORDER BY sale_date DESC
        LIMIT 200
      `,
    )
  } catch (error) {
    console.error("Error fetching sales data:", error)
    return []
  }
}

async function fetchTransactionHistory(startDate: string, endDate: string, tenantContext: TenantContext) {
  try {
    const tenantId = tenantContext.tenantId
    return await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT 
          item_type,
          quantity,
          transaction_type,
          transaction_date,
          total_cost
        FROM transaction_history
        WHERE transaction_date >= ${startDate} AND transaction_date <= ${endDate}
          AND tenant_id = ${tenantId}
        ORDER BY transaction_date DESC
        LIMIT 500
      `,
    )
  } catch (error) {
    console.error("Error fetching transaction history:", error)
    return []
  }
}

interface DataSummaryInput {
  inventory: Array<{ name: string; quantity: number; unit: string }>
  transactions: Array<{ itemType: string; quantity: number; transactionType: string; date: string; totalCost?: number }>
  transactionHistory: Array<{
    item_type: string
    quantity: number
    transaction_type: string
    transaction_date: string
    total_cost?: number
  }>
  laborData: Array<{
    deployment_date: string
    hf_laborers: number
    hf_cost_per_laborer: number
    outside_laborers: number
    outside_cost_per_laborer: number
    total_cost: number
    code: string
  }>
  processingData: Record<
    string,
    Array<{
      process_date: string
      crop_today: number
      ripe_today: number
      dry_p_bags: number
      dry_cherry_bags: number
    }>
  >
  rainfallData: Array<{ record_date: string; inches: number; cents: number }>
  expenseData: Array<{ entry_date: string; code: string; total_amount: number }>
  dispatchData: Array<{ dispatch_date: string; location: string; coffee_type: string; bag_type: string; bags_dispatched: number }>
  salesData: Array<{
    sale_date: string
    coffee_type: string
    bag_type: string
    weight_kgs: number
    price_per_kg: number
    total_revenue: number
    buyer_name: string
  }>
  fiscalYear: string
}

function buildDataSummary(data: DataSummaryInput): string {
  const sections: string[] = []

  sections.push(`## Fiscal Year: ${data.fiscalYear}`)
  sections.push(`## Analysis Date: ${new Date().toLocaleDateString("en-IN")}`)

  const history =
    data.transactionHistory && data.transactionHistory.length > 0
      ? data.transactionHistory.map((t) => ({
          itemType: String(t.item_type),
          quantity: Number(t.quantity) || 0,
          transactionType: String(t.transaction_type || ""),
          date: String(t.transaction_date || ""),
          totalCost: t.total_cost ? Number(t.total_cost) : 0,
        }))
      : data.transactions

  if (data.inventory && data.inventory.length > 0) {
    sections.push("\n## Current Inventory Snapshot")
    const lowStock = data.inventory.filter((i) => i.quantity < 10)
    sections.push(`- Total items tracked: ${data.inventory.length}`)
    sections.push(`- Low stock items (<10 units): ${lowStock.length}`)
  }

  if (history && history.length > 0) {
    sections.push("\n## Transaction History Patterns")
    const restocking = history.filter((t) => t.transactionType.toLowerCase().includes("restock"))
    const depleting = history.filter((t) => t.transactionType.toLowerCase().includes("deplet"))
    const totalRestockCost = restocking.reduce((sum, t) => sum + (Number(t.totalCost) || 0), 0)
    const totalDepleteQty = depleting.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0)

    sections.push(`- Total transactions analyzed: ${history.length}`)
    sections.push(`- Restocking transactions: ${restocking.length} (Total cost: ₹${totalRestockCost.toLocaleString()})`)
    sections.push(`- Depleting transactions: ${depleting.length} (Total quantity: ${totalDepleteQty.toFixed(2)})`)

    const monthlyTotals: Record<string, { restock: number; deplete: number }> = {}
    history.forEach((t) => {
      if (!t.date) return
      const date = new Date(t.date)
      if (isNaN(date.getTime())) return
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      if (!monthlyTotals[month]) monthlyTotals[month] = { restock: 0, deplete: 0 }
      if (t.transactionType.toLowerCase().includes("restock")) {
        monthlyTotals[month].restock += Number(t.quantity) || 0
      } else if (t.transactionType.toLowerCase().includes("deplet")) {
        monthlyTotals[month].deplete += Number(t.quantity) || 0
      }
    })

    const lastMonths = Object.entries(monthlyTotals)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, totals]) => `${month}: +${totals.restock.toFixed(1)} / -${totals.deplete.toFixed(1)}`)

    if (lastMonths.length > 0) {
      sections.push(`- Last 6 months inflow/outflow (qty): ${lastMonths.join(", ")}`)
    }

    const restockByItem: Record<string, number> = {}
    const depleteByItem: Record<string, number> = {}
    restocking.forEach((t) => {
      restockByItem[t.itemType] = (restockByItem[t.itemType] || 0) + (Number(t.totalCost) || 0)
    })
    depleting.forEach((t) => {
      depleteByItem[t.itemType] = (depleteByItem[t.itemType] || 0) + (Number(t.quantity) || 0)
    })

    const topRestock = Object.entries(restockByItem)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([item, cost]) => `${item}: ₹${cost.toLocaleString()}`)
    const topDeplete = Object.entries(depleteByItem)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([item, qty]) => `${item}: ${qty.toFixed(2)}`)

    if (topRestock.length > 0) {
      sections.push(`- Top restocking spend: ${topRestock.join(", ")}`)
    }
    if (topDeplete.length > 0) {
      sections.push(`- Top depletion volume: ${topDeplete.join(", ")}`)
    }
  }

  if (data.laborData && data.laborData.length > 0) {
    sections.push("\n## Labor Deployment Summary")
    const totalEstateWorkers = data.laborData.reduce((sum, l) => sum + (Number(l.hf_laborers) || 0), 0)
    const totalEstateAmount = data.laborData.reduce(
      (sum, l) => sum + (Number(l.hf_laborers) || 0) * (Number(l.hf_cost_per_laborer) || 0),
      0,
    )
    const totalOutsideWorkers = data.laborData.reduce((sum, l) => sum + (Number(l.outside_laborers) || 0), 0)
    const totalOutsideAmount = data.laborData.reduce(
      (sum, l) => sum + (Number(l.outside_laborers) || 0) * (Number(l.outside_cost_per_laborer) || 0),
      0,
    )
    const totalCost = data.laborData.reduce((sum, l) => sum + (Number(l.total_cost) || 0), 0)
    sections.push(`- Total labor entries: ${data.laborData.length}`)
    sections.push(`- Estate workers deployed: ${totalEstateWorkers} (Total: ₹${totalEstateAmount.toLocaleString()})`)
    sections.push(`- Outside workers deployed: ${totalOutsideWorkers} (Total: ₹${totalOutsideAmount.toLocaleString()})`)
    sections.push(`- Total labor cost: ₹${totalCost.toLocaleString()}`)
  }

  if (data.processingData && Object.keys(data.processingData).length > 0) {
    sections.push("\n## Coffee Processing Summary")
    let totalAllCrop = 0
    let totalAllDryP = 0
    let totalAllDryCherry = 0

    for (const [location, records] of Object.entries(data.processingData)) {
      if (records && records.length > 0) {
        const totalCrop = records.reduce((sum, r) => sum + (Number(r.crop_today) || 0), 0)
        const totalRipe = records.reduce((sum, r) => sum + (Number(r.ripe_today) || 0), 0)
        const totalDryPBags = records.reduce((sum, r) => sum + (Number(r.dry_p_bags) || 0), 0)
        const totalDryCherryBags = records.reduce((sum, r) => sum + (Number(r.dry_cherry_bags) || 0), 0)

        totalAllCrop += totalCrop
        totalAllDryP += totalDryPBags
        totalAllDryCherry += totalDryCherryBags

        sections.push(`\n### ${location}`)
        sections.push(`- Processing days: ${records.length}`)
        sections.push(`- Total crop: ${totalCrop.toFixed(2)} kg, Ripe: ${totalRipe.toFixed(2)} kg`)
        sections.push(
          `- Dry Parchment Bags: ${totalDryPBags.toFixed(2)}, Dry Cherry Bags: ${totalDryCherryBags.toFixed(2)}`,
        )
      }
    }

    sections.push(`\n### Overall Processing Totals`)
    sections.push(`- Total crop processed: ${totalAllCrop.toFixed(2)} kg`)
    sections.push(
      `- Total Dry Parchment Bags: ${totalAllDryP.toFixed(2)}, Total Dry Cherry Bags: ${totalAllDryCherry.toFixed(2)}`,
    )
  }

  if (data.rainfallData && data.rainfallData.length > 0) {
    sections.push("\n## Rainfall Data")
    const totalRainfall = data.rainfallData.reduce((sum, r) => {
      return sum + (Number(r.inches) || 0) + (Number(r.cents) || 0) / 100
    }, 0)
    const monthlyRain: Record<string, number> = {}
    data.rainfallData.forEach((r) => {
      const month = new Date(r.record_date).toLocaleString("default", { month: "short" })
      if (!monthlyRain[month]) monthlyRain[month] = 0
      monthlyRain[month] += (Number(r.inches) || 0) + (Number(r.cents) || 0) / 100
    })
    sections.push(`- Total rainfall this year: ${totalRainfall.toFixed(2)} inches`)
    sections.push(`- Recording days: ${data.rainfallData.length}`)
    sections.push(
      `- Monthly breakdown: ${Object.entries(monthlyRain)
        .map(([m, v]) => `${m}: ${v.toFixed(2)}`)
        .join(", ")}`,
    )
  }

  if (data.expenseData && data.expenseData.length > 0) {
    sections.push("\n## Other Expenses Summary")
    const totalExpenses = data.expenseData.reduce((sum, e) => sum + (Number(e.total_amount) || 0), 0)
    const byActivity: Record<string, number> = {}
    data.expenseData.forEach((e) => {
      const code = e.code || "Uncategorized"
      if (!byActivity[code]) byActivity[code] = 0
      byActivity[code] += Number(e.total_amount) || 0
    })
    sections.push(`- Total other expenses: ₹${totalExpenses.toLocaleString()}`)
    sections.push(`- Number of expense entries: ${data.expenseData.length}`)
    const topExpenses = Object.entries(byActivity).sort((a, b) => b[1] - a[1]).slice(0, 5)
    if (topExpenses.length > 0) {
      sections.push(`- Top expense categories: ${topExpenses.map(([code, amt]) => `${code}: ₹${amt.toLocaleString()}`).join(", ")}`)
    }
  }

  if (data.dispatchData && data.dispatchData.length > 0) {
    sections.push("\n## Dispatch Summary")
    const totalDispatches = data.dispatchData.length
    const totalBagsDispatched = data.dispatchData.reduce((sum, d) => sum + (Number(d.bags_dispatched) || 0), 0)
    const byCoffeeType: Record<string, number> = {}
    const normalizeBagTypeLabel = (value: string | null | undefined) => {
      if (!value) return "Unknown"
      const normalized = value.toLowerCase()
      if (normalized.includes("cherry")) return "Dry Cherry"
      if (normalized.includes("parch")) return "Dry Parchment"
      if (normalized.includes("dry p")) return "Dry Parchment"
      return "Dry Parchment"
    }
    data.dispatchData.forEach((d) => {
      const coffeeType = d.coffee_type || "Unknown"
      if (!byCoffeeType[coffeeType]) byCoffeeType[coffeeType] = 0
      byCoffeeType[coffeeType] += Number(d.bags_dispatched) || 0
    })

    const byBagType: Record<string, number> = {}
    data.dispatchData.forEach((d) => {
      const bagType = normalizeBagTypeLabel(d.bag_type)
      if (!byBagType[bagType]) byBagType[bagType] = 0
      byBagType[bagType] += Number(d.bags_dispatched) || 0
    })

    sections.push(`- Total dispatch entries: ${totalDispatches}`)
    sections.push(`- Total bags dispatched: ${totalBagsDispatched.toFixed(2)}`)

    const coffeeTypeSummary = Object.entries(byCoffeeType)
      .map(([type, bags]) => `${type}: ${bags.toFixed(2)} bags`)
      .join(", ")
    sections.push(`- By coffee type: ${coffeeTypeSummary}`)

    const bagTypeSummary = Object.entries(byBagType)
      .map(([type, bags]) => `${type}: ${bags.toFixed(2)} bags`)
      .join(", ")
    sections.push(`- By bag type: ${bagTypeSummary}`)
  }

  if (data.salesData && data.salesData.length > 0) {
    sections.push("\n## Sales Summary")
    const totalSales = data.salesData.length
    const totalRevenue = data.salesData.reduce((sum, s) => sum + (Number(s.total_revenue) || 0), 0)
    sections.push(`- Total sales entries: ${totalSales}`)
    sections.push(`- Total revenue: ₹${totalRevenue.toLocaleString()}`)
  }

  return sections.join("\n")
}
