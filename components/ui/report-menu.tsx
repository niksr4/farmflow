"use client"

import { useMemo, useState } from "react"
import { FileDown, FileSpreadsheet, FileText, Loader2, Table2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"
import { useSingleFlight } from "@/hooks/use-single-flight"
import { buildReport, type ReportDefinition, type ReportFormat } from "@/lib/reports/report-definition"
import { buildReportPeriods, type ReportPeriodId } from "@/lib/reports/report-periods"

/**
 * THE ONE CONTROL, ON EVERY TAB THAT HAS SOMETHING TO REPORT.
 *
 * It is always called "Report", always carries the same icon, and always sits at the top right of
 * the tab's own card header. That uniformity IS the feature: an estate manager who finds it once
 * has found it everywhere, and before this the same action was called "Export CSV" on Sales,
 * "Export" on Stock, "Reference PDF" on Costs and nothing at all on sixteen other tabs.
 *
 * PDF is listed first on purpose. CSV and Excel are for somebody who wants to do more arithmetic;
 * the PDF is the thing an estate prints and hands to an accountant, a bank or a buyer, which is
 * what "can I get a report" actually means here.
 *
 * ⚠ EVERY BUTTON IN HERE IS EXPLICITLY `type="button"`. `components/ui/button.tsx` sets no default
 * type, so inside a `<form>` an untyped Button is a submit -- and this control is dropped into tab
 * headers that sometimes sit within a filter form. Tamper-confirmed elsewhere in this codebase:
 * untyping one Cancel made dismissing a form save a record. See the forms section of CLAUDE.md.
 */

const FORMAT_LABELS: Record<ReportFormat, { label: string; hint: string; icon: typeof FileText }> = {
  pdf: { label: "PDF", hint: "Print or send", icon: FileText },
  xlsx: { label: "Excel", hint: "Formulas and totals", icon: FileSpreadsheet },
  csv: { label: "CSV", hint: "Raw rows", icon: Table2 },
}

/** Formats in the order they are offered. PDF first: it is the one that gets handed to somebody. */
const OFFERED: ReportFormat[] = ["pdf", "xlsx", "csv"]

export type ReportMenuProps = {
  definition: ReportDefinition
  /**
   * Set when there is genuinely nothing to report -- an empty period, a filter with no matches.
   * Pass `emptyReason` too: a disabled control with no explanation reads as a broken one.
   */
  disabled?: boolean
  emptyReason?: string
  size?: "sm" | "default"
  className?: string
}

export function ReportMenu({
  definition,
  disabled = false,
  emptyReason = "Nothing to report for this period yet",
  size = "sm",
  className,
}: ReportMenuProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<ReportFormat | null>(null)
  const [periodId, setPeriodId] = useState<ReportPeriodId>("current")

  /**
   * Bumped every time the menu opens, so the periods below are rebuilt against the estate's
   * CURRENT today rather than the one that was true when this tab first mounted.
   *
   * ⚠ REMOVING THE useMemo ALONE DOES NOT FIX THIS. `DropdownMenu` is Radix's uncontrolled root,
   * so opening it does not re-render ReportMenu -- the dates would still be the mount-time ones
   * and `buildReport` would receive bounds captured with them. The root has to become controlled
   * for the open to be observable at all. FarmFlow runs on phones that stay open for days, so
   * after IST midnight the menu offered yesterday's "Today" and exported yesterday's rows under
   * it.
   */
  const [openNonce, setOpenNonce] = useState(0)

  /**
   * The periods this tab says it can serve, in the order the module defines them.
   *
   * Derived from the definition rather than from a list here, so a tab whose endpoint takes no
   * date range shows no selector at all instead of a selector that cannot work. The default is
   * `["current"]`, which is exactly one entry and therefore renders nothing -- see the note on
   * `ReportDefinition.periods`.
   */
  const offeredPeriods = useMemo(() => {
    const allowed = definition.periods ?? ["current"]
    return buildReportPeriods({ currentLabel: definition.period }).filter((period) =>
      allowed.includes(period.id),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openNonce is the point: it is not
    // read in the body, it exists to rebuild these dates each time the menu is opened.
  }, [definition.periods, definition.period, openNonce])

  const selectedPeriod =
    offeredPeriods.find((period) => period.id === periodId) ?? offeredPeriods[0]

  /**
   * Single-flighted because building a PDF or a workbook is async and a phone double-tap would
   * otherwise produce two downloads of the same report. `useSingleFlight`, not
   * `useSingleFlightSubmit` -- this is a menu item, not a form submit, so there is no native
   * submit for a dropped second call to fall through to.
   */
  const download = useSingleFlight(async (format: ReportFormat) => {
    setBusy(format)
    try {
      const { blob, filename } = await buildReport(definition, format, selectedPeriod)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Revoked on the next tick: Safari has not finished reading the blob when click() returns.
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (error) {
      // A failed report must say so. Silently handing back nothing is this codebase's whole
      // failure mode, and a download that does not happen looks identical to a slow one.
      toast({
        title: "Could not build that report",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  })

  if (disabled) {
    return (
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled
        title={emptyReason}
        className={className}
      >
        <FileDown className="mr-2 h-4 w-4" />
        Report
      </Button>
    )
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setOpenNonce((n) => n + 1)
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size={size} className={className}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
          Report
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-semibold text-stone-500 dark:text-stone-400">
          {definition.title}
          {/*
            Only when there is no selector. With one, the tab's filter is already the first radio
            item, and printing it here too put the same period on screen twice.
          */}
          {offeredPeriods.length <= 1 && definition.period ? (
            <span className="block font-normal">{definition.period}</span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {offeredPeriods.length > 1 ? (
          <>
            <DropdownMenuLabel className="pb-1 pt-2 text-[10px] font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Period
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={selectedPeriod?.id}
              onValueChange={(value) => setPeriodId(value as ReportPeriodId)}
            >
              {offeredPeriods.map((period) => (
                <DropdownMenuRadioItem
                  key={period.id}
                  value={period.id}
                  className="h-10 cursor-pointer text-xs"
                  /**
                   * ⚠ WITHOUT THIS THE MENU CLOSES THE MOMENT YOU PICK A PERIOD, so there is no
                   * way to then choose a format -- you would reopen the menu, find the period
                   * reset to the default, and download the range you were trying to leave. Radix
                   * closes on select by default. Caught by the mounted test; no source scan could
                   * see it, and by hand it looks like the control simply ignoring the period.
                   */
                  onSelect={(event) => event.preventDefault()}
                >
                  {period.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="pb-1 pt-2 text-[10px] font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Download as
            </DropdownMenuLabel>
          </>
        ) : null}
        {OFFERED.map((format) => {
          const { label, hint, icon: Icon } = FORMAT_LABELS[format]
          return (
            <DropdownMenuItem
              key={format}
              // h-11 so it stays a real tap target on a phone, which is where the muster is read.
              className="h-11 cursor-pointer gap-3"
              onSelect={(event) => {
                // The menu would otherwise close before the download starts, unmounting the busy
                // state mid-build.
                event.preventDefault()
                void download(format)
              }}
            >
              <Icon className="h-4 w-4 text-stone-500 dark:text-stone-400" />
              <span className="flex-1">{label}</span>
              <span className="text-[11px] text-stone-500 dark:text-stone-400">{hint}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ReportMenu
