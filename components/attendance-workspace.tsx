"use client"

import { useState } from "react"
import { Check, Users, BookOpen, IndianRupee, CalendarRange } from "lucide-react"
import { cn } from "@/lib/utils"
import AttendanceTab from "./attendance-tab"
import WorkerProfilesTab from "./worker-profiles-tab"
import WorkerLedgerTab from "./worker-ledger-tab"
import PayrollSummaryTab from "./payroll-summary-tab"
import AttendanceReportTab from "./attendance-report-tab"

// TEMPORARY: Ledger crashes for some tenants in production — taken offline until
// the underlying issue is fixed. Keep in sync with the equivalent flag that used
// to live in accounts-page.tsx before Workers/Ledger/Payroll moved here.
const LEDGER_TAB_DISABLED = true

type AttendanceSection = "attendance" | "workers" | "ledger" | "payroll" | "report"

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
    </div>
  )
}
