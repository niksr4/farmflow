"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  Copy,
  Fingerprint,
  Link2,
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { EmptyState } from "@/components/ui/empty-state"
import { StatTile } from "@/components/ui/stat-tile"
import { useSingleFlight } from "@/hooks/use-single-flight"
import { todayIso } from "@/lib/date-utils"
import {
  BIOMETRIC_RELAY_HOST,
  BIOMETRIC_RELAY_PORT,
  SCANNER_SETUP_POLL_MS,
  scannerSetupState,
  type ScannerSignals,
} from "@/lib/scanner-setup"

/**
 * How an estate connects its own fingerprint terminal, without anyone from FarmFlow involved.
 *
 * WHY THIS IS A TAB AND NOT A HELP PAGE. Commissioning a terminal is a loop -- change a setting,
 * reboot, put a finger on the reader, find out whether anything arrived -- and until now the last
 * step had no answer inside the product. The device panel lived collapsed inside the muster and
 * only appeared once `hasBiometricDevices` was true, so the screen for registering your first
 * device was hidden until you had registered a device. Everything else (does the relay see it, did
 * my punch land, which code is which person) needed someone with database access. That is the
 * whole reason a scanner could not be installed without help.
 *
 * So every step here reads its own state from live data rather than telling the estate what to do
 * and hoping. A step goes green because the thing actually happened.
 *
 * THE ROSTER COMES BEFORE THE TERMINAL (changed 2026-09-01). The first version had estates enrol
 * people on the device, type a name there, and match the numbers up afterwards -- and it promised
 * FarmFlow would read that typed name back. It cannot. `biometric_enrollments` is empty in both
 * databases because `recordEnrollment` only fires on the hdata.aspx `realtimeEnroll` message, and
 * the iclock/ADMS path this hardware speaks has no enrolment message at all. So the screen said
 * "code 7 -- SUM" would appear and it only ever said "code 7".
 *
 * Assigning the ids in FarmFlow first makes that promise unnecessary rather than fixing it: the
 * name comes from the estate's own roster, matched on the number, so a punch is a person from the
 * first one. Matching unknown codes is now the exception path (step 5) instead of the main road,
 * which is also the honest description -- an unmatched code means somebody mistyped a number.
 */

type BiometricDevice = {
  id: string
  label: string
  serialNumber: string
  active: boolean
  lastSeenAt: string | null
  isOnline: boolean
  estate: string | null
}

type UnmappedCode = {
  deviceUserCode: string
  punchCount: number
  lastSeenAt: string | null
  enrolledName: string | null
}

type Punch = {
  id: string
  deviceUserCode: string
  deviceLabel: string | null
  punchedAt: string | null
  workerName: string | null
  enrolledName: string | null
}

type Worker = { id: string; name: string; deviceUserCode: string | null; estate: string | null }

const clockTime = (value: string | null) => {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        } catch {
          // Clipboard is permission-gated and blocked outright in some in-app browsers. The value
          // is on screen either way, so a failure here is not worth an error toast.
        }
      }}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-left dark:border-emerald-500/20 dark:bg-stone-900"
    >
      <span className="text-[11px] font-bold uppercase tracking-widest text-stone-400">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-sm font-bold text-stone-700 dark:text-stone-200">{value}</span>
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-stone-300" />}
      </span>
    </button>
  )
}

function Step({
  number,
  title,
  done,
  children,
}: {
  number: number
  title: string
  done: boolean
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
            done ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-400 dark:bg-stone-800",
          )}
        >
          {done ? <Check className="h-3.5 w-3.5" /> : number}
        </span>
        <h3 className="text-sm font-bold text-stone-700 dark:text-stone-200">{title}</h3>
      </div>
      {/* Aligns with the title, not the numbered badge: 24px badge + 10px gap. */}
      <div className="space-y-3 pl-[34px] pt-3 text-sm text-stone-600 dark:text-stone-300">{children}</div>
    </section>
  )
}

export default function AttendanceScannerTab() {
  const [devices, setDevices] = useState<BiometricDevice[]>([])
  const [unmappedCodes, setUnmappedCodes] = useState<UnmappedCode[]>([])
  const [punches, setPunches] = useState<Punch[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [isMultiEstate, setIsMultiEstate] = useState(false)
  const [estates, setEstates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [newLabel, setNewLabel] = useState("")
  const [newSerial, setNewSerial] = useState("")
  const [newEstate, setNewEstate] = useState("")
  const [isAddingDevice, setIsAddingDevice] = useState(false)
  const [assigningCode, setAssigningCode] = useState<string | null>(null)
  const [selectedWorkerByCode, setSelectedWorkerByCode] = useState<Record<string, string>>({})

  // Ref, not state: the poller reads it to decide whether to skip a tick, and putting it in state
  // would restart the interval on every keystroke of the register form.
  const busyRef = useRef(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    const [devicesRes, unmappedRes, punchesRes, snapshotRes] = await Promise.all([
      fetch("/api/attendance/devices", { cache: "no-store", signal }),
      fetch("/api/attendance/unmapped-codes", { cache: "no-store", signal }),
      fetch("/api/attendance/punches?limit=20", { cache: "no-store", signal }),
      fetch(`/api/attendance?date=${todayIso()}`, { cache: "no-store", signal }),
    ])
    const [devicesData, unmappedData, punchesData, snapshot] = await Promise.all([
      devicesRes.json().catch(() => ({})),
      unmappedRes.json().catch(() => ({})),
      punchesRes.json().catch(() => ({})),
      snapshotRes.json().catch(() => ({})),
    ])

    setDevices(Array.isArray(devicesData?.devices) ? devicesData.devices : [])
    setUnmappedCodes(Array.isArray(unmappedData?.unmappedCodes) ? unmappedData.unmappedCodes : [])
    setPunches(Array.isArray(punchesData?.punches) ? punchesData.punches : [])
    const roster: Worker[] = Array.isArray(snapshot?.workers) ? snapshot.workers : []
    setWorkers(roster)
    setIsMultiEstate(Boolean(snapshot?.isMultiEstate))
    setEstates([...new Set(roster.map((w) => w.estate).filter((e): e is string => Boolean(e)))].sort())
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
      .catch(() => {
        // A failed poll is not worth a toast -- the panel keeps showing the last good state.
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [load])

  /**
   * Setup is a wait-and-see loop, so the page refreshes itself. Without this an estate reboots the
   * terminal, stares at "Waiting", and has no way to know the answer changed a minute ago.
   *
   * It stands down while a form is mid-submit: a poll landing between the POST and its response
   * would repaint the list underneath the person typing.
   */
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setInterval(() => {
      if (busyRef.current || document.visibilityState === "hidden") return
      void load(controller.signal).catch(() => {})
    }, SCANNER_SETUP_POLL_MS)
    return () => {
      window.clearInterval(timer)
      controller.abort()
    }
  }, [load])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } catch {
      toast.error("Could not refresh")
    } finally {
      setRefreshing(false)
    }
  }

  const signals: ScannerSignals = useMemo(
    () => ({
      deviceCount: devices.length,
      anyDeviceSeen: devices.some((d) => d.lastSeenAt != null),
      anyDeviceOnline: devices.some((d) => d.isOnline),
      punchCount: punches.length,
      unmappedCount: unmappedCodes.length,
      mappedWorkerCount: workers.filter((w) => w.deviceUserCode).length,
    }),
    [devices, punches, unmappedCodes, workers],
  )
  const steps = scannerSetupState(signals)
  const workersWithoutId = useMemo(() => workers.filter((w) => !w.deviceUserCode), [workers])

  const handleAddDeviceUnguarded = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLabel.trim() || !newSerial.trim()) return
    setIsAddingDevice(true)
    busyRef.current = true
    try {
      const res = await fetch("/api/attendance/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel, serialNumber: newSerial, estate: newEstate || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to register device")
      toast.success(`${data.device?.label || "Device"} registered`)
      setNewLabel("")
      setNewSerial("")
      setNewEstate("")
      await load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to register device")
    } finally {
      setIsAddingDevice(false)
      busyRef.current = false
    }
  }

  // Mobile double-tap guard: `disabled` only applies after a re-render, so two fast taps both
  // entered this handler. See lib/single-flight.ts.
  const handleAddDevice = useSingleFlight(handleAddDeviceUnguarded)

  const handleAssignCode = async (code: string) => {
    const workerId = selectedWorkerByCode[code]
    if (!workerId) {
      toast.error("Pick an employee first")
      return
    }
    setAssigningCode(code)
    busyRef.current = true
    try {
      const res = await fetch(`/api/attendance/workers/${workerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceUserCode: code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to assign code")
      toast.success(`Code ${code} mapped — past attendance backfilled`)
      await load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to assign code")
    } finally {
      setAssigningCode(null)
      busyRef.current = false
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-2xl bg-stone-100 dark:bg-stone-800" />
        <div className="h-40 animate-pulse rounded-2xl bg-stone-100 dark:bg-stone-800" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-stone-700 dark:text-stone-200">Fingerprint scanner</h2>
          <p className="text-xs text-stone-400">
            Set up a terminal yourself. Each step turns green when it has actually happened.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={refreshing}
          className="h-9 shrink-0 rounded-xl"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Terminals" value={devices.length} icon={<Fingerprint className="h-3.5 w-3.5" />} />
        <StatTile
          label="Online"
          value={devices.filter((d) => d.isOnline).length}
          tone={signals.anyDeviceOnline ? "emerald" : undefined}
          icon={signals.anyDeviceOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        />
        <StatTile label="Codes to match" value={unmappedCodes.length} tone={unmappedCodes.length > 0 ? "amber" : undefined} />
      </div>

      <Step number={1} title="Register the terminal" done={steps.registered}>
        <p>
          The serial number is on the sticker underneath the device, and on its own screen under
          <span className="font-semibold"> Menu → System Info</span>. FarmFlow accepts punches only from a serial
          registered here, so nothing a stranger plugs in can write to your muster.
        </p>

        {devices.length > 0 && (
          <div className="space-y-2">
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-stone-800"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-stone-700 dark:text-stone-200">{device.label}</p>
                  <p className="font-mono text-xs text-stone-400">
                    {device.serialNumber}
                    {device.estate ? ` · ${device.estate}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                    device.isOnline ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-400",
                  )}
                >
                  {device.isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                  {device.isOnline ? "Online" : device.lastSeenAt ? `Last seen ${clockTime(device.lastSeenAt)}` : "Never seen"}
                </span>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddDevice} className="space-y-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Where it stands (e.g. Muster shed)"
            className="h-10 text-sm"
            disabled={isAddingDevice}
          />
          <Input
            value={newSerial}
            onChange={(e) => setNewSerial(e.target.value)}
            placeholder="Serial number"
            className="h-10 font-mono text-sm"
            disabled={isAddingDevice}
          />
          {/* Only asked of tenants who actually run more than one estate -- the same test the
              muster's own estate picker uses. One estate means the answer is never interesting. */}
          {isMultiEstate && estates.length > 0 && (
            <select
              value={newEstate}
              onChange={(e) => setNewEstate(e.target.value)}
              className="h-10 w-full rounded-md border border-stone-200 bg-white px-2 text-sm dark:border-stone-700 dark:bg-stone-900"
              disabled={isAddingDevice}
            >
              <option value="">Serves every estate</option>
              {estates.map((estate) => (
                <option key={estate} value={estate}>
                  {estate}
                </option>
              ))}
            </select>
          )}
          <Button
            type="submit"
            size="sm"
            className="h-10 w-full rounded-xl bg-emerald-700 hover:bg-emerald-800"
            disabled={isAddingDevice || !newLabel.trim() || !newSerial.trim()}
          >
            {isAddingDevice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Register this terminal"}
          </Button>
        </form>
      </Step>

      <Step number={2} title="Point the terminal at FarmFlow" done={steps.reachedUs}>
        <p>
          On the device: <span className="font-semibold">Menu → Comm → Ethernet/Cloud Server</span>. Set these two
          values, leave Cloud ID blank, leave the path as the firmware has it, then reboot.
        </p>
        <div className="space-y-1.5">
          <CopyField label="Server IP" value={BIOMETRIC_RELAY_HOST} />
          <CopyField label="Server port" value={BIOMETRIC_RELAY_PORT} />
        </div>
        <p className="text-xs text-stone-400">
          Not thefarmflow.in, and not port 443. These terminals speak plain HTTP with no TLS at all, and will not
          follow the redirect a secure site answers with — so they talk to a relay that forwards the punches on.
        </p>
        <div
          className={cn(
            "rounded-xl px-3 py-2.5 text-xs font-semibold",
            steps.reachedUs
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
          )}
        >
          {steps.reachedUs
            ? `The terminal has reached FarmFlow. Last contact ${clockTime(
                devices.map((d) => d.lastSeenAt).filter(Boolean).sort().at(-1) ?? null,
              )}.`
            : devices.length === 0
              ? "Register the terminal above first — punches from an unknown serial are refused."
              : "Waiting for the terminal to call in. It checks every 30 seconds once the settings are right."}
        </div>
      </Step>

      <Step number={3} title="Give each worker a fingerprint ID in FarmFlow" done={steps.rosterHasIds}>
        <p>
          Decide the numbers <span className="font-semibold">here first</span>, before touching the terminal. Open{" "}
          <span className="font-semibold">Workers</span> and fill in the <span className="font-semibold">Finger ID</span>{" "}
          column — one number per person, any number you like, as long as no two people share one.
        </p>
        <p className="text-xs text-stone-400">
          Give each estate its own block — 1–99 for one, 101–199 for the next — so two terminals never issue the same
          number to different people.
        </p>
        <div
          className={cn(
            "rounded-xl px-3 py-2.5 text-xs font-semibold",
            steps.rosterHasIds
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "bg-stone-50 text-stone-500 dark:bg-stone-800",
          )}
        >
          {workers.length === 0
            ? "No workers on the roster yet — add them under Workers first."
            : `${signals.mappedWorkerCount} of ${workers.length} workers have a fingerprint ID.`}
          {/* Named, not just counted. "22 of 28" sends someone scrolling a roster looking for the
              six; the six are right here. Capped because a fresh estate would otherwise print its
              whole roster into a setup step. */}
          {workersWithoutId.length > 0 && (
            <span className="mt-1 block font-normal text-stone-500 dark:text-stone-400">
              Still without one: {workersWithoutId.slice(0, 6).map((w) => w.name).join(", ")}
              {workersWithoutId.length > 6 ? ` and ${workersWithoutId.length - 6} more` : ""}.
            </span>
          )}
        </div>
      </Step>

      <Step number={4} title="Enrol the same IDs on the terminal" done={steps.punchesArriving}>
        <p>
          On the device: <span className="font-semibold">Menu → User → New User</span>. Set the{" "}
          <span className="font-semibold">User ID to exactly the Finger ID</span> you gave that person above, then
          register their finger. Same person, same number, both places — that is the whole trick.
        </p>
        <p className="text-xs text-stone-400">
          The name you type on the terminal is for the device&apos;s own screen. FarmFlow shows the name from your
          roster, matched on the number, so it does not matter if you skip it or spell it differently.
        </p>
        <div
          className={cn(
            "rounded-xl px-3 py-2.5 text-xs font-semibold",
            steps.punchesArriving
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "bg-stone-50 text-stone-500 dark:bg-stone-800",
          )}
        >
          {steps.punchesArriving
            ? `${punches.length} punch${punches.length === 1 ? "" : "es"} received.`
            : "No punches yet. Put a finger on the reader — it should appear here within a minute."}
        </div>
      </Step>

      <Step number={5} title="Anything that did not match" done={steps.allMapped}>
        <p>
          If a number punches that nobody on the roster carries, it waits here. The usual cause is a typo — the ID
          enrolled on the terminal is not the Finger ID in FarmFlow. Match it once and every past punch from that
          number is backfilled onto the muster; nothing recorded before the match is lost.
        </p>
        {unmappedCodes.length === 0 ? (
          <EmptyState
            title={signals.mappedWorkerCount > 0 ? "Nothing outstanding" : "Nothing to match yet"}
            description={
              signals.mappedWorkerCount > 0
                ? `Every number that has punched belongs to somebody. ${signals.mappedWorkerCount} people are linked.`
                : "Unrecognised numbers would appear here. None have."
            }
            size="sm"
          />
        ) : (
          <div className="space-y-2">
            {unmappedCodes.map((row) => (
              <div
                key={row.deviceUserCode}
                className="space-y-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 dark:border-amber-500/20 dark:bg-amber-500/[0.06]"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                    Code {row.deviceUserCode}
                    {row.enrolledName ? <span className="ml-1.5 font-semibold">— {row.enrolledName}</span> : null}
                  </p>
                  <p className="text-xs text-amber-700/70">
                    {row.punchCount} punch{row.punchCount === 1 ? "" : "es"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedWorkerByCode[row.deviceUserCode] || ""}
                    onChange={(e) =>
                      setSelectedWorkerByCode((cur) => ({ ...cur, [row.deviceUserCode]: e.target.value }))
                    }
                    className="h-10 flex-1 rounded-xl border border-amber-200 bg-white px-2 text-sm dark:border-amber-500/20 dark:bg-stone-900"
                  >
                    <option value="">Match to…</option>
                    {workers.map((worker) => (
                      <option key={worker.id} value={worker.id}>
                        {worker.name}
                        {worker.deviceUserCode ? ` (already ${worker.deviceUserCode})` : ""}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    className="h-10 rounded-xl bg-amber-700 hover:bg-amber-800"
                    disabled={assigningCode === row.deviceUserCode || !selectedWorkerByCode[row.deviceUserCode]}
                    onClick={() => handleAssignCode(row.deviceUserCode)}
                  >
                    {assigningCode === row.deviceUserCode ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Step>

      <Step number={6} title="Watch it work" done={steps.punchesArriving}>
        <p className="text-xs text-stone-400">
          The last twenty punches, newest first. This list is the proof — if a punch is here, FarmFlow has it.
        </p>
        {punches.length === 0 ? (
          <EmptyState title="No punches yet" description="They appear here the moment the terminal sends one." size="sm" />
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {punches.map((punch) => (
              <li key={punch.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm text-stone-700 dark:text-stone-200">
                  {punch.workerName || punch.enrolledName || `Code ${punch.deviceUserCode}`}
                  {!punch.workerName && (
                    <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">
                      unmatched
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-xs text-stone-400">
                  {/* Which terminal only matters once there is more than one to tell apart. */}
                  {devices.length > 1 && punch.deviceLabel ? `${punch.deviceLabel} · ` : ""}
                  {clockTime(punch.punchedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Step>

      <section className="rounded-2xl bg-stone-50 p-4 text-xs text-stone-500 dark:bg-stone-800/60 dark:text-stone-400">
        <p className="pb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">If nothing arrives</p>
        <ul className="list-disc space-y-1.5 pl-4">
          <li>
            The device says <span className="font-semibold">connect fail</span> — check it is on the estate WiFi and can
            reach the internet, then re-check the IP and port above digit by digit.
          </li>
          <li>
            Punches arrive on the wrong day — the terminal&apos;s own clock is wrong. FarmFlow trusts the time the
            device sends, so set the date and time on the device and they will land correctly from then on.
          </li>
          <li>
            Nothing at all, but the device says it connected — the serial registered above does not match the serial on
            the device. Compare them character by character; O and 0 are the usual culprits.
          </li>
          <li>
            Punches arrive but show as an unmatched number — the User ID enrolled on the terminal is not the Finger ID
            that person carries in FarmFlow. Fix whichever is wrong, or match it in step 5; either way the punches
            already taken are kept.
          </li>
        </ul>
      </section>
    </div>
  )
}
