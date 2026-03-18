"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency } from "@/lib/format"
import type { WeeklyCompareMode, WeeklyDeltas, WeeklySummary } from "@/components/admin/types"
import { formatCount } from "@/components/admin/utils"

type WeeklySummarySectionProps = {
  selectedTenantId: string
  weeklyStartDate: string
  weeklyEndDate: string
  weeklyCompareMode: WeeklyCompareMode
  weeklyRangeLabel: string
  weeklyCompareLabel: string | null
  weeklySummary: WeeklySummary | null
  weeklyPeriodLabel: string
  weeklyDeltas: WeeklyDeltas | null
  isWeeklyLoading: boolean
  isSendingWeeklyWhatsApp: boolean
  onWeeklyStartDateChange: (value: string) => void
  onWeeklyEndDateChange: (value: string) => void
  onWeeklyCompareModeChange: (value: WeeklyCompareMode) => void
  onLoadWeeklySummary: () => void
  onCopyWeeklySummary: () => void
  onSendWeeklySummaryWhatsApp: () => void
  onDownloadWeeklySummary: () => void
}

const SummaryMetricCard = ({
  label,
  value,
  delta,
}: {
  label: string
  value: string
  delta?: { className: string; text: string } | null
}) => (
  <div className="rounded-lg border border-border/60 bg-white/80 p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="font-semibold">{value}</p>
    {delta ? <p className={`mt-1 text-xs ${delta.className}`}>{delta.text}</p> : null}
  </div>
)

export function WeeklySummarySection({
  selectedTenantId,
  weeklyStartDate,
  weeklyEndDate,
  weeklyCompareMode,
  weeklyRangeLabel,
  weeklyCompareLabel,
  weeklySummary,
  weeklyPeriodLabel,
  weeklyDeltas,
  isWeeklyLoading,
  isSendingWeeklyWhatsApp,
  onWeeklyStartDateChange,
  onWeeklyEndDateChange,
  onWeeklyCompareModeChange,
  onLoadWeeklySummary,
  onCopyWeeklySummary,
  onSendWeeklySummaryWhatsApp,
  onDownloadWeeklySummary,
}: WeeklySummarySectionProps) {
  return (
    <Card id="weekly-summary" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Weekly Summary</CardTitle>
        <CardDescription>Share a quick snapshot with owners or buyers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="weekly-start">Start date</Label>
            <Input id="weekly-start" type="date" value={weeklyStartDate} onChange={(event) => onWeeklyStartDateChange(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weekly-end">End date</Label>
            <Input id="weekly-end" type="date" value={weeklyEndDate} onChange={(event) => onWeeklyEndDateChange(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Compare period</Label>
            <Select value={weeklyCompareMode} onValueChange={(value) => onWeeklyCompareModeChange(value === "previous" ? "previous" : "none")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="previous">Previous period</SelectItem>
                <SelectItem value="none">No compare</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Selected range</Label>
            <div className="rounded-md border border-border/60 bg-white/80 px-3 py-2 text-sm text-muted-foreground">
              {weeklyRangeLabel}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onLoadWeeklySummary} disabled={!selectedTenantId || isWeeklyLoading}>
            {isWeeklyLoading ? "Loading..." : "Generate Summary"}
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" onClick={onCopyWeeklySummary} disabled={!selectedTenantId}>
            Copy WhatsApp summary
          </Button>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={onSendWeeklySummaryWhatsApp}
            disabled={!selectedTenantId || isSendingWeeklyWhatsApp}
          >
            {isSendingWeeklyWhatsApp ? "Sending WhatsApp..." : "Send to WhatsApp"}
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" onClick={onDownloadWeeklySummary} disabled={!selectedTenantId}>
            Print / Save PDF
          </Button>
        </div>
        {weeklyCompareLabel ? (
          <p className="text-xs text-muted-foreground">Comparison window: {weeklyCompareLabel}</p>
        ) : null}
        {!weeklySummary ? (
          <p className="text-sm text-muted-foreground">Generate a summary to see activity in your selected date range.</p>
        ) : (
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <SummaryMetricCard label="Inventory items" value={formatCount(weeklySummary.inventoryCount)} />
            <SummaryMetricCard
              label={`Transactions (${weeklyPeriodLabel})`}
              value={formatCount(weeklySummary.transactionCount)}
              delta={weeklyDeltas?.transaction}
            />
            <SummaryMetricCard
              label={`Processing records (${weeklyPeriodLabel})`}
              value={formatCount(weeklySummary.processingCount)}
              delta={weeklyDeltas?.processing}
            />
            <SummaryMetricCard
              label={`Dispatches (${weeklyPeriodLabel})`}
              value={formatCount(weeklySummary.dispatchCount)}
              delta={weeklyDeltas?.dispatch}
            />
            <SummaryMetricCard
              label={`Sales (${weeklyPeriodLabel})`}
              value={formatCount(weeklySummary.salesCount)}
              delta={weeklyDeltas?.salesCount}
            />
            <SummaryMetricCard
              label={`Sales revenue (${weeklyPeriodLabel})`}
              value={formatCurrency(weeklySummary.salesRevenue)}
              delta={weeklyDeltas?.salesRevenue}
            />
            <SummaryMetricCard
              label={`Labor spend (${weeklyPeriodLabel})`}
              value={formatCurrency(weeklySummary.laborSpend)}
              delta={weeklyDeltas?.laborSpend}
            />
            <SummaryMetricCard
              label={`Expense spend (${weeklyPeriodLabel})`}
              value={formatCurrency(weeklySummary.expenseSpend)}
              delta={weeklyDeltas?.expenseSpend}
            />
            <div className="rounded-lg border border-border/60 bg-white/80 p-3 md:col-span-2">
              <p className="text-xs text-muted-foreground">Receivables outstanding</p>
              <p className="font-semibold">{formatCurrency(weeklySummary.receivablesOutstanding)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
