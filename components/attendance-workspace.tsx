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

// TEMPORARY: Ledger crashes for some tenants in production — taken offline until
// the underlying issue is fixed. Keep in sync with the equivalent flag that used
// to live in accounts-page.tsx before Workers/Ledger/Payroll moved here.
const LEDGER_TAB_DISABLED = true

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
          ...(!LEDGER_TAB_DISABLED ? [{ value: "ledger" as AttendanceSection, label: "Ledger", icon: BookOpen }] : []),
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
      {!LEDGER_TAB_DISABLED && showLaborManagement && activeSection === "ledger" && (
        <div className="px-3 sm:px-0">
          <WorkerLedgerTab />
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
