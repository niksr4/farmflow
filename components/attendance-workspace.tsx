"use client"

import { useState } from "react"
import { Check, Users, BookOpen, IndianRupee, CalendarRange, Fingerprint } from "lucide-react"
import { cn } from "@/lib/utils"
import AttendanceTab from "./attendance-tab"
import WorkerProfilesTab from "./worker-profiles-tab"
import PayrollSummaryTab from "./payroll-summary-tab"
import AttendanceReportTab from "./attendance-report-tab"
import AttendanceScannerTab from "./attendance-scanner-tab"

/**
 * THE LEDGER IS GONE, 2026-09-08 — deleted, not disabled, and not coming back.
 *
 * It bundled three things that belong in different places, and splitting them removes a subtab
 * rather than relocating one (decided 2026-09-05, see STATUS.md):
 *
 *   a rule    ("hold 20% of every day")  -> Workers, beside the daily rate. A rule is a property
 *                                           of a person, and payroll cannot apply one with no home.
 *   a history ("what Ravi has taken")    -> Workers, with Ravi. One subject, one place.
 *   an entry  ("Ravi took Rs 2,000")     -> inline on the Workers row AND the Payroll row, because
 *                                           an advance happens on the 12th and payroll runs on the
 *                                           30th, and both are moments you notice it.
 *
 * WHAT IS LOST: bulk entry. Five advances is five rows rather than one flat list. Advances are
 * individual and occasional, so that is a fair price — revisit if an estate does them in batches.
 *
 * `worker_ledger` is unchanged and still the right table for events; `/api/worker-ledger` still
 * reads and writes it. Only the tab is gone. It had been off the nav since 2026-09-03 and was
 * therefore already unreachable — deleting it removes 425 lines nobody could open but which still
 * had to be updated on every payload change, which is what dead code costs.
 *
 * ⚠ UNTIL THE WORKERS MONEY PANEL LANDS, `worker_ledger` HAS NO SCREEN. Payroll's deductions term
 * is fed by a table with no way in — the exact state tests/payroll-sources-are-reachable.test.ts
 * was written to catch, and it still asserts it, loudly, rather than going green on the deletion.
 * The panel is step 4 in docs/PAYROLL-RULES-PLAN.md. Point that test at it when it exists.
 *
 * ---- history, kept because it is the reason for the paragraph above ----
 * Switched off 2026-07-25 alongside Picking, both "crashing for some tenants", behind
 * LEDGER_TAB_DISABLED. The cause was a bare date column arriving from the Neon driver as a JS
 * Date. Picking was repaired with an ALL_WORKERS sentinel; the Ledger was not, and stayed dark for
 * six weeks while its table's emptiness was read as "nobody uses advances" — in STATUS.md, wrongly.
 * Re-enabled 2026-09-03 after verifying the data path; it crashed on the first click, because the
 * real cause was a second, different bug: `<SelectItem value="">`, which Radix rejects during
 * render. Finding one real fix and stopping there is what cost the second attempt.
 */

/**
 * Live as of 2026-09-01, when HoneyFarm's terminal went in.
 *
 * This was dev-only while no estate had hardware and the enrolment id ranges were unsettled.
 * Both conditions are now met: a terminal is installed, and HoneyFarm's 28 workers already carry
 * fingerprint ids 1-104 loaded from their payroll export, so the numbering question answered
 * itself for the estate that needed it first.
 *
 * Deliberately NOT gated on the tenant already having a device, unlike the collapsed panel inside
 * the muster (see hasBiometricDevices in app/api/attendance/route.ts). That gate exists to keep
 * biometrics out of sight for estates with no hardware, which is reasonable for a settings panel
 * and self-defeating for a setup wizard: the screen for registering your first device cannot
 * require you to already have one. That chicken-and-egg is the whole reason a terminal could not
 * be commissioned without help, and it is what this tab exists to remove.
 *
 * The muster's panel is now a strict subset of this tab and should be retired -- left in place for
 * today so nothing changes underneath an estate mid-setup.
 */

type AttendanceSection = "attendance" | "workers" | "ledger" | "payroll" | "report" | "scanner"

type AttendanceWorkspaceProps = {
  showLaborManagement?: boolean
  /** Passed down rather than read from the cookie -- see loadSnapshot in attendance-tab.tsx. */
  selectedEstate?: string | null
}

const SECTION_COLORS: Record<AttendanceSection, string> = {
  attendance: "bg-teal-600 border-teal-600 text-white",
  workers: "bg-cyan-600 border-cyan-600 text-white",
  ledger: "bg-indigo-600 border-indigo-600 text-white",
  payroll: "bg-purple-600 border-purple-600 text-white",
  report: "bg-slate-700 border-slate-700 text-white",
  scanner: "bg-emerald-700 border-emerald-700 text-white",
}

export default function AttendanceWorkspace({ showLaborManagement = false, selectedEstate = null }: AttendanceWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<AttendanceSection>("attendance")

  const navItems: Array<{ value: AttendanceSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { value: "attendance", label: "Muster", icon: Check },
    ...(showLaborManagement
      ? [
          { value: "workers" as AttendanceSection, label: "Workers", icon: Users },
          { value: "payroll" as AttendanceSection, label: "Payroll", icon: IndianRupee },
          // Sits beside Payroll because it answers the same shape of question over the same
          // period -- who was here, for how long -- and is what gets checked when a wage is queried.
          { value: "report" as AttendanceSection, label: "Attendance", icon: CalendarRange },
          // Sits last because it is a one-off: you commission a terminal once and then never
          // open this again, unlike everything to its left.
          { value: "scanner" as AttendanceSection, label: "Scanner", icon: Fingerprint },
        ]
      : []),
  ]

  return (
    <div className="space-y-4">
      {navItems.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2 sm:px-0">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeSection === item.value
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setActiveSection(item.value)}
                className={cn(
                  // min-h-11 (44px) rather than taller type -- these were 30px, and they are how a
                  // writer gets between the roll and the roster on a phone.
                  "flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                  isActive
                    ? SECTION_COLORS[item.value]
                    : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            )
          })}
        </div>
      )}

      {activeSection === "attendance" && <AttendanceTab selectedEstate={selectedEstate} />}
      {showLaborManagement && activeSection === "workers" && (
        <div className="px-3 sm:px-0">
          <WorkerProfilesTab />
        </div>
      )}
      {showLaborManagement && activeSection === "payroll" && (
        <div className="px-3 sm:px-0">
          <PayrollSummaryTab />
        </div>
      )}

      {showLaborManagement && activeSection === "report" && (
        <div className="px-3 sm:px-0">
          <AttendanceReportTab />
        </div>
      )}

      {showLaborManagement && activeSection === "scanner" && (
        <div className="px-3 sm:px-0">
          <AttendanceScannerTab />
        </div>
      )}
    </div>
  )
}
