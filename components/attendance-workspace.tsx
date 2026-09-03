"use client"

import { useState } from "react"
import { Check, Users, BookOpen, IndianRupee, CalendarRange, Fingerprint } from "lucide-react"
import { cn } from "@/lib/utils"
import AttendanceTab from "./attendance-tab"
import WorkerProfilesTab from "./worker-profiles-tab"
import WorkerLedgerTab from "./worker-ledger-tab"
import PayrollSummaryTab from "./payroll-summary-tab"
import AttendanceReportTab from "./attendance-report-tab"
import AttendanceScannerTab from "./attendance-scanner-tab"

/**
 * THE LEDGER IS OFF AGAIN, 2026-09-03 — and this time the cause is known and fixed.
 *
 * I turned it back on earlier today after verifying the data path and finding a date-serialisation
 * fix already in place. It still crashed. That fix was real but it was a DIFFERENT bug: the actual
 * crash is `<SelectItem value="">` in worker-ledger-tab.tsx, which Radix rejects during render and
 * which takes the tab down through the error boundary regardless of whether there is any data.
 *
 * Picking and the Ledger went offline together in 1272d15 for the same reason. Picking was repaired
 * with an ALL_WORKERS sentinel; the Ledger was the last empty-string SelectItem in the codebase and
 * nobody went back for it. Finding the date fix and stopping there is what caught me out.
 *
 * The sentinel is now applied and tests/no-empty-select-item.test.ts stops another appearing. What
 * has NOT happened is somebody opening the screen and confirming it renders — which is exactly the
 * step I skipped last time, so it is off until it does.
 *
 * TO RESTORE: put the nav entry and the render branch back, open Muster -> Ledger, add one entry.
 * Nothing else is known to be wrong.
 *
 * ---- previous note, kept because the history matters ----
 * The Ledger is back, and the flag that hid it is gone rather than flipped.
 *
 * It was switched off on 2026-07-25 alongside Picking, both "crashing for some tenants". The cause
 * was the same for both: a bare date column comes back from the Neon driver as a JS Date, which
 * `String()`s to "Wed Jan 28 2026 00:00:00 GMT+0530", and the client renders `.slice(0, 10)` of
 * that -- "Wed Jan 28" -- into an `<input type="date">`. Some tenants meant the ones with any
 * records. `entry_date::text` in app/api/worker-ledger/route.ts fixed it, and the comment there
 * says so; nobody flipped the switch back.
 *
 * SO THE TABLE READ AS UNADOPTED. `worker_ledger` has 0 rows across every tenant, which was taken
 * as a product signal -- including in STATUS.md -- when it was the flag: no screen, no rows, no
 * way to notice. A kill switch with no owner and no date outlives the memory of why it was set,
 * and then the emptiness it causes becomes evidence for leaving it alone.
 *
 * Verified end to end against dev before removing: three entries round-trip as "2026-01-28", and
 * the balances payroll reads come back correct.
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
