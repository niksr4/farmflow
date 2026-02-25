"use client"

import * as React from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Line,
  Area,
  AreaChart,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { InventoryItem, Transaction } from "@/lib/inventory-types"
import { getFiscalYearDateRange, getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { useAuth } from "@/hooks/use-auth"
import { formatDateForDisplay, formatDateOnly } from "@/lib/date-utils"

interface AiAnalysisChartsProps {
  inventory: InventoryItem[]
  transactions: Transaction[]
}

type ChartTransaction = {
  itemType: string
  quantity: number
  transactionType: "Restocking" | "Depleting" | "Item Deleted" | "Unit Change" | string
  totalCost?: number
  price?: number
  date: string
}

interface LaborRecord {
  deployment_date: string
  hf_laborers: number
  hf_cost_per_laborer: number
  outside_laborers: number
  outside_cost_per_laborer: number
  total_cost: number
  code: string
}

interface ProcessingRecord {
  process_date: string
  crop_today: number
  dry_p_bags: number
  dry_cherry_bags: number
}

const COLORS = ["#059669", "#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#d1fae5"] // Green palette
const LABOR_COLORS = ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"] // Blue palette

// Helper to parse DD/MM/YYYY HH:MM date strings
const parseTransactionDate = (dateString: string): Date | null => {
  if (!dateString || typeof dateString !== "string") return null
  if (dateString.includes("T")) {
    const direct = new Date(dateString)
    return isNaN(direct.getTime()) ? null : direct
  }

  const cleaned = dateString.replace(",", "").trim()
  const parts = cleaned.split(" ")
  if (parts.length < 1) return null
  const dateParts = parts[0].split("/")
  if (dateParts.length !== 3) return null
  // DD/MM/YYYY -> YYYY-MM-DD
  const isoDateString = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`
  const date = new Date(isoDateString)
  return isNaN(date.getTime()) ? null : date
}

export default function AiAnalysisCharts({ inventory, transactions }: AiAnalysisChartsProps) {
  const { user } = useAuth()
  const [laborData, setLaborData] = React.useState<LaborRecord[]>([])
  const [processingData, setProcessingData] = React.useState<Record<string, ProcessingRecord[]>>({})
  const [fallbackTransactions, setFallbackTransactions] = React.useState<ChartTransaction[]>([])

  // Fetch labor and processing data from dedicated API
  React.useEffect(() => {
    const fetchData = async () => {
      if (!user?.tenantId) return
      const fiscalYear = getCurrentFiscalYear()
      const { startDate, endDate } = getFiscalYearDateRange(fiscalYear)

      try {
        const response = await fetch(
          `/api/ai-charts-data?fiscalYearStart=${startDate}&fiscalYearEnd=${endDate}`,
        )
        const data = await response.json()

        if (data.success) {
          if (data.laborData) {
            setLaborData(data.laborData)
          }
          if (data.processingData) {
            setProcessingData(data.processingData)
          }
        }
      } catch (error) {
        console.error("Error fetching AI charts data:", error)
      }
    }

    fetchData()
  }, [user?.tenantId])

  React.useEffect(() => {
    const fetchFallbackTransactions = async () => {
      if (!user?.tenantId) return
      if (transactions.length > 0) return

      try {
        const response = await fetch("/api/transactions-neon?limit=500")
        const data = await response.json()
        if (data.success && Array.isArray(data.transactions)) {
          const mapped: ChartTransaction[] = data.transactions.map((t: any) => {
            let transactionType: ChartTransaction["transactionType"] = "Depleting"
            const typeStr = String(t.transaction_type || "").toLowerCase()

            if (typeStr === "restock" || typeStr === "restocking") {
              transactionType = "Restocking"
            } else if (typeStr === "deplete" || typeStr === "depleting") {
              transactionType = "Depleting"
            } else if (typeStr === "item deleted") {
              transactionType = "Item Deleted"
            } else if (typeStr === "unit change") {
              transactionType = "Unit Change"
            }

            return {
              itemType: String(t.item_type),
              quantity: Number(t.quantity) || 0,
              transactionType,
              date: t.transaction_date ? formatDateForDisplay(t.transaction_date) : "",
              totalCost: t.total_cost ? Number(t.total_cost) : undefined,
              price: t.price ? Number(t.price) : undefined,
            }
          })
          setFallbackTransactions(mapped)
        }
      } catch (error) {
        console.error("Error fetching fallback transactions:", error)
      }
    }

    fetchFallbackTransactions()
  }, [user?.tenantId, transactions.length])

  const chartTransactions = React.useMemo<ChartTransaction[]>(() => {
    const source = transactions.length > 0 ? transactions : fallbackTransactions
    return source
      .map((t: any) => {
        const itemType = t.itemType ?? t.item_type
        const quantity = Number(t.quantity) || 0
        const totalCost = t.totalCost ?? t.total_cost
        const price = t.price
        const date = t.date ?? t.transaction_date
        const rawType = String(t.transactionType ?? t.transaction_type ?? "").toLowerCase()

        let transactionType: ChartTransaction["transactionType"] = "Depleting"
        if (rawType === "restock" || rawType === "restocking") {
          transactionType = "Restocking"
        } else if (rawType === "deplete" || rawType === "depleting") {
          transactionType = "Depleting"
        } else if (rawType === "item deleted") {
          transactionType = "Item Deleted"
        } else if (rawType === "unit change") {
          transactionType = "Unit Change"
        } else if (t.transactionType) {
          transactionType = t.transactionType
        }

        if (!itemType || !date) return null

        return {
          itemType: String(itemType),
          quantity,
          transactionType,
          totalCost: totalCost ? Number(totalCost) : undefined,
          price: price ? Number(price) : undefined,
          date: String(date),
        }
      })
      .filter(Boolean) as ChartTransaction[]
  }, [transactions, fallbackTransactions])

  const consumptionData = React.useMemo(() => {
    const monthlyConsumption: { [key: string]: { date: Date; total: number } } = {}
    chartTransactions
      .filter((t) => t.transactionType === "Depleting")
      .forEach((t) => {
        const date = parseTransactionDate(t.date)
        if (date) {
          const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` // YYYY-MM format for sorting
          if (!monthlyConsumption[monthYear]) {
            monthlyConsumption[monthYear] = { date: new Date(date.getFullYear(), date.getMonth(), 1), total: 0 }
          }
          monthlyConsumption[monthYear].total += Number(t.quantity) || 0
        }
      })

    const sortedData = Object.values(monthlyConsumption)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(-6) // Limit to last 6 months
      .map((item) => {
        const month = String(item.date.getMonth() + 1).padStart(2, "0")
        const year = String(item.date.getFullYear()).slice(-2)
        return {
          month: `${month}/${year}`,
          total: item.total,
        }
      })
    return sortedData
  }, [chartTransactions])

  const costAnalysisData = React.useMemo(() => {
    const itemCosts: { [key: string]: number } = {}
    chartTransactions
      .filter((t) => t.transactionType === "Restocking" && t.totalCost !== undefined && t.totalCost !== null)
      .forEach((t) => {
        if (!itemCosts[t.itemType]) {
          itemCosts[t.itemType] = 0
        }
        itemCosts[t.itemType] += Number(t.totalCost) || 0
      })

    const sortedData = Object.entries(itemCosts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6) // Top 6 items by cost
    return sortedData
  }, [chartTransactions])

  const inventoryValueData = React.useMemo(() => {
    if (chartTransactions.length === 0) {
      return []
    }

    const chronologicalTransactions = [...chartTransactions]
      .map((t) => ({ ...t, parsedDate: parseTransactionDate(t.date) }))
      .filter((t) => t.parsedDate !== null)
      .sort((a, b) => a.parsedDate!.getTime() - b.parsedDate!.getTime())

    const itemValues: Record<string, { quantity: number; totalValue: number; avgPrice: number }> = {}
    let runningTotalValue = 0
    const valueOverTime: { date: string; value: number }[] = []

    chronologicalTransactions.forEach((transaction) => {
      const { itemType, quantity, transactionType, price, totalCost, parsedDate } = transaction
      if (!itemValues[itemType]) itemValues[itemType] = { quantity: 0, totalValue: 0, avgPrice: 0 }

      const currentItem = itemValues[itemType]
      const numQuantity = Number(quantity) || 0

      if (transactionType === "Restocking") {
        const cost = Number(totalCost) || numQuantity * (Number(price) || 0)
        currentItem.quantity += numQuantity
        currentItem.totalValue += cost
        currentItem.avgPrice = currentItem.quantity > 0 ? currentItem.totalValue / currentItem.quantity : 0
        runningTotalValue += cost
      } else if (transactionType === "Depleting") {
        const depletedValue = numQuantity * (currentItem.avgPrice || 0)
        currentItem.quantity = Math.max(0, currentItem.quantity - numQuantity)
        currentItem.totalValue = Math.max(0, currentItem.totalValue - depletedValue)
        runningTotalValue -= depletedValue
        if (currentItem.quantity > 0) {
          currentItem.avgPrice = currentItem.totalValue / currentItem.quantity
        } else {
          currentItem.avgPrice = 0
          // currentItem.totalValue is already adjusted
        }
      }
      // For "Item Deleted" or "Unit Change", current logic might need adjustment if they affect value.
      // Assuming they are handled by inventory rebuild or specific value adjustments not covered here.

      if (parsedDate) {
        const formattedDate = parsedDate.toISOString().split("T")[0] // YYYY-MM-DD
        valueOverTime.push({ date: formattedDate, value: Math.max(0, runningTotalValue) })
      }
    })

    const dailyValues = valueOverTime.reduce(
      (acc, curr) => {
        acc[curr.date] = curr.value
        return acc
      },
      {} as Record<string, number>,
    )

    const sortedData = Object.entries(dailyValues)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Ensure chronological order
      .slice(-30) // Last 30 days
    return sortedData
  }, [chartTransactions])

  // Labor cost data by month
  const laborCostData = React.useMemo(() => {
    const monthlyLabor: Record<
      string,
      { month: string; hfCost: number; outsideCost: number; totalCost: number }
    > = {}
    
    laborData.forEach((record) => {
      const date = new Date(record.deployment_date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      const month = String(date.getMonth() + 1).padStart(2, "0")
      const year = String(date.getFullYear()).slice(-2)
      const monthLabel = `${month}/${year}`
      
      if (!monthlyLabor[monthKey]) {
        monthlyLabor[monthKey] = { month: monthLabel, hfCost: 0, outsideCost: 0, totalCost: 0 }
      }
      // Calculate cost: laborers * cost_per_laborer
      const hfCost = (Number(record.hf_laborers) || 0) * (Number(record.hf_cost_per_laborer) || 0)
      const outsideCost = (Number(record.outside_laborers) || 0) * (Number(record.outside_cost_per_laborer) || 0)
      monthlyLabor[monthKey].hfCost += hfCost
      monthlyLabor[monthKey].outsideCost += outsideCost
      monthlyLabor[monthKey].totalCost += hfCost + outsideCost
    })

    return Object.entries(monthlyLabor)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([, data]) => data)
  }, [laborData])

  // Processing output by location
  const processingOutputData = React.useMemo(() => {
    return Object.entries(processingData).map(([location, records]) => {
      const totalDryPBags = records.reduce((sum, r) => sum + (Number(r.dry_p_bags) || 0), 0)
      const totalDryCherryBags = records.reduce((sum, r) => sum + (Number(r.dry_cherry_bags) || 0), 0)
      const shortName = location.replace(" Robusta", "").replace(" Arabica", "")
      const total = totalDryPBags + totalDryCherryBags
      return {
        name: shortName,
        dryP: Number(totalDryPBags.toFixed(2)),
        dryCherry: Number(totalDryCherryBags.toFixed(2)),
        total: Number(total.toFixed(2)),
      }
    })
  }, [processingData])

  const consumptionChartConfig: ChartConfig = {
    total: {
      label: "Units Consumed",
      color: COLORS[0],
    },
  }

  const laborChartConfig: ChartConfig = {
    hfCost: {
      label: "Estate Labor",
      color: LABOR_COLORS[0],
    },
    outsideCost: {
      label: "Outside Labor",
      color: LABOR_COLORS[1],
    },
    totalCost: {
      label: "Total Labor",
      color: LABOR_COLORS[3],
    },
  }

  const processingChartConfig: ChartConfig = {
    dryP: {
      label: "Dry Parchment Bags",
      color: COLORS[0],
    },
    dryCherry: {
      label: "Dry Cherry Bags",
      color: COLORS[2],
    },
    total: {
      label: "Total Bags",
      color: COLORS[3],
    },
  }

  const costChartConfig: ChartConfig = {
    value: {
      label: "Cost (₹)",
      color: COLORS[0],
    },
  }

  const valueChartConfig: ChartConfig = {
    value: {
      label: "Total Value (₹)",
      color: COLORS[1],
    },
  }

  if (transactions.length === 0 && inventory.length === 0) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle>
                {i === 1 ? "Monthly Consumption" : i === 2 ? "Restocking Cost Analysis" : "Inventory Value Over Time"}
              </CardTitle>
              <CardDescription>No data available to display charts.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center min-h-[250px]">
              <p className="text-sm text-muted-foreground">Please add some transactions.</p>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
      {/* Labor Cost Chart */}
      <Card className="xl:col-span-1">
        <CardHeader>
          <CardTitle>Monthly Labor Costs</CardTitle>
          <CardDescription>Estate vs outside labor costs over time.</CardDescription>
        </CardHeader>
        <CardContent>
          {laborCostData.length > 0 ? (
            <ChartContainer config={laborChartConfig} className="h-[250px] w-full">
              <BarChart data={laborCostData} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />
                <YAxis tickFormatter={(value) => `₹${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="hfCost" fill="var(--color-hfCost)" radius={[4, 4, 0, 0]} stackId="labor" />
                <Bar dataKey="outsideCost" fill="var(--color-outsideCost)" radius={[4, 4, 0, 0]} stackId="labor" />
                <Line type="monotone" dataKey="totalCost" stroke="var(--color-totalCost)" strokeWidth={2} dot={false} />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center min-h-[250px]">
              <p className="text-sm text-muted-foreground">No labor data available.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Processing Output Chart */}
      <Card className="xl:col-span-1">
        <CardHeader>
          <CardTitle>Processing Output by Location</CardTitle>
          <CardDescription>Dry Parchment and Dry Cherry bags by location.</CardDescription>
        </CardHeader>
        <CardContent>
          {processingOutputData.length > 0 ? (
            <ChartContainer config={processingChartConfig} className="h-[250px] w-full">
              <BarChart data={processingOutputData} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="dryP" fill="var(--color-dryP)" radius={[4, 4, 0, 0]} stackId="processing" />
                <Bar dataKey="dryCherry" fill="var(--color-dryCherry)" radius={[4, 4, 0, 0]} stackId="processing" />
                <Line type="monotone" dataKey="total" stroke="var(--color-total)" strokeWidth={2} dot={false} />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center min-h-[250px]">
              <p className="text-sm text-muted-foreground">No processing data available.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restocking Cost Pie Chart */}
      <Card className="xl:col-span-1">
        <CardHeader>
          <CardTitle>Restocking Cost Analysis</CardTitle>
          <CardDescription>Top 6 items ranked by restocking spend.</CardDescription>
        </CardHeader>
        <CardContent>
          {costAnalysisData.length > 0 ? (
            <ChartContainer config={costChartConfig} className="h-[250px] w-full">
              <BarChart data={costAnalysisData} layout="vertical" accessibilityLayer>
                <CartesianGrid horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value) => `₹${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`}
                />
                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={80} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center min-h-[250px]">
              <p className="text-sm text-muted-foreground">No cost data available.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Consumption Chart */}
      <Card className="xl:col-span-1">
        <CardHeader>
          <CardTitle>Monthly Consumption</CardTitle>
          <CardDescription>Total units depleted in the last 6 months.</CardDescription>
        </CardHeader>
        <CardContent>
          {consumptionData.length > 0 ? (
            <ChartContainer config={consumptionChartConfig} className="h-[250px] w-full">
              <BarChart data={consumptionData} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="total" fill="var(--color-total)" radius={4} />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center min-h-[250px]">
              <p className="text-sm text-muted-foreground">No consumption data available.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inventory Value Over Time Chart */}
      <Card className="lg:col-span-2 xl:col-span-2">
        <CardHeader>
          <CardTitle>Inventory Value Over Time</CardTitle>
          <CardDescription>Total inventory value over the last 30 days.</CardDescription>
        </CardHeader>
        <CardContent>
          {inventoryValueData.length > 0 ? (
            <ChartContainer config={valueChartConfig} className="h-[250px] w-full">
              <AreaChart data={inventoryValueData} accessibilityLayer>
                <defs>
                  <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value) => formatDateOnly(`${value}T00:00:00`)}
                />
                <YAxis
                  tickFormatter={(value) => `₹${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0)}`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="value" stroke="var(--color-value)" fill="url(#valueFill)" />
              </AreaChart>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center min-h-[250px]">
              <p className="text-sm text-muted-foreground">No inventory value data available.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
