"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Fingerprint,
  Link2,
  Loader2,
  PlusCircle,
  Trash2,
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

type BiometricDevice = {
  id: string
  label: string
  serialNumber: string
  active: boolean
  lastSeenAt: string | null
  isOnline: boolean
}

type UnmappedCode = {
  deviceUserCode: string
  punchCount: number
  firstSeenAt: string | null
  lastSeenAt: string | null
}

type WorkerOption = { id: string; name: string }

export default function AttendanceDeviceSettings({ workers }: { workers: WorkerOption[] }) {
  const [devices, setDevices] = useState<BiometricDevice[]>([])
  const [unmappedCodes, setUnmappedCodes] = useState<UnmappedCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [newLabel, setNewLabel] = useState("")
  const [newSerial, setNewSerial] = useState("")
  const [isAddingDevice, setIsAddingDevice] = useState(false)
  const [removingDeviceId, setRemovingDeviceId] = useState<string | null>(null)
  const [assigningCode, setAssigningCode] = useState<string | null>(null)
  const [selectedWorkerByCode, setSelectedWorkerByCode] = useState<Record<string, string>>({})
  const [serverOrigin, setServerOrigin] = useState("")

  useEffect(() => {
    if (typeof window !== "undefined") setServerOrigin(window.location.origin)
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [devicesRes, unmappedRes] = await Promise.all([
        fetch("/api/attendance/devices", { cache: "no-store" }),
        fetch("/api/attendance/unmapped-codes", { cache: "no-store" }),
      ])
      const devicesData = await devicesRes.json().catch(() => ({}))
      const unmappedData = await unmappedRes.json().catch(() => ({}))
      setDevices(Array.isArray(devicesData?.devices) ? devicesData.devices : [])
      setUnmappedCodes(Array.isArray(unmappedData?.unmappedCodes) ? unmappedData.unmappedCodes : [])
    } catch {
      // best-effort — settings panel, not the critical muster path
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const handleAddDeviceUnguarded = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLabel.trim() || !newSerial.trim()) return
    setIsAddingDevice(true)
    try {
      const res = await fetch("/api/attendance/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel, serialNumber: newSerial }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to register device")
      toast.success(`${data.device?.label || "Device"} registered`)
      setNewLabel("")
      setNewSerial("")
      setShowAddDevice(false)
      await loadAll()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to register device")
    } finally {
      setIsAddingDevice(false)
    }
  }

  // Mobile double-tap guard: `disabled` only applies after a re-render, so two fast taps both
  // entered this handler. See lib/single-flight.ts.
  const handleAddDevice = useSingleFlight(handleAddDeviceUnguarded)

  const handleRemoveDevice = async (id: string, label: string) => {
    if (!window.confirm(`Remove "${label}"? Future punches from this device will be rejected until re-registered.`)) return
    setRemovingDeviceId(id)
    try {
      const res = await fetch(`/api/attendance/devices/${id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to remove device")
      toast.success(`${label} removed`)
      setDevices((cur) => cur.filter((d) => d.id !== id))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove device")
    } finally {
      setRemovingDeviceId(null)
    }
  }

  const handleAssignCode = async (code: string) => {
    const workerId = selectedWorkerByCode[code]
    if (!workerId) {
      toast.error("Pick an employee first")
      return
    }
    setAssigningCode(code)
    try {
      const res = await fetch(`/api/attendance/workers/${workerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceUserCode: code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to assign code")
      toast.success(`Code ${code} mapped — past attendance backfilled`)
      setUnmappedCodes((cur) => cur.filter((row) => row.deviceUserCode !== code))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to assign code")
    } finally {
      setAssigningCode(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Server address card */}
      <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3.5 space-y-1.5 dark:bg-emerald-500/[0.06] dark:border-emerald-500/[0.15]">
        <div className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Configure your fingerprint terminal</p>
        </div>
        <p className="text-xs text-emerald-700/80 dark:text-emerald-300/70">
          In the device&apos;s network / cloud server settings, set the server address to{" "}
          <span className="font-mono font-semibold">{serverOrigin || "https://your-farmflow-domain"}</span>, port 443
          (HTTPS). The path is fixed by the device firmware — leave it as-is.
        </p>
      </div>

      {/* Device overview tiles */}
      {!loading && devices.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Registered" value={devices.length} icon={<Fingerprint className="h-3.5 w-3.5" />} />
          <StatTile
            label="Online"
            value={devices.filter((d) => d.isOnline).length}
            tone="emerald"
            icon={<Wifi className="h-3.5 w-3.5" />}
          />
          <StatTile
            label="Offline"
            value={devices.filter((d) => d.active && !d.isOnline).length}
            tone="rose"
            icon={<WifiOff className="h-3.5 w-3.5" />}
          />
        </div>
      )}

      {/* Devices list */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-stone-400 px-1">Registered devices</p>
        {loading ? (
          <div className="h-16 rounded-2xl bg-stone-100 animate-pulse" />
        ) : devices.length === 0 ? (
          <EmptyState title="No devices yet" description="Register your terminal's serial number below." size="sm" />
        ) : (
          devices.map((device) => (
            <div key={device.id} className="flex items-center justify-between rounded-2xl bg-white shadow-sm px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-stone-700 truncate">{device.label}</p>
                <p className="text-xs text-stone-400 font-mono">{device.serialNumber}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                    device.isOnline ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-400",
                  )}
                >
                  {device.isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                  {device.isOnline ? "Online" : "Offline"}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${device.label}`}
                  disabled={removingDeviceId === device.id}
                  onClick={() => handleRemoveDevice(device.id, device.label)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-stone-300 active:bg-stone-100 disabled:opacity-50"
                >
                  {removingDeviceId === device.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ))
        )}

        {!showAddDevice ? (
          <button
            type="button"
            onClick={() => setShowAddDevice(true)}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-200 py-3.5 text-sm font-semibold text-stone-400 hover:border-stone-300 transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            Register device
          </button>
        ) : (
          <form onSubmit={handleAddDevice} className="rounded-2xl border border-stone-200 bg-white p-3 space-y-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (e.g. Muster shed terminal)"
              className="h-9 text-sm"
              autoFocus
              disabled={isAddingDevice}
            />
            <Input
              value={newSerial}
              onChange={(e) => setNewSerial(e.target.value)}
              placeholder="Serial number (from device settings screen)"
              className="h-9 text-sm font-mono"
              disabled={isAddingDevice}
            />
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                className="h-9 rounded-xl bg-emerald-700 hover:bg-emerald-800"
                disabled={isAddingDevice || !newLabel.trim() || !newSerial.trim()}
              >
                {isAddingDevice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Register"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setShowAddDevice(false)
                  setNewLabel("")
                  setNewSerial("")
                }}
                className="text-xs text-stone-400 px-1"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Unmapped codes */}
      {unmappedCodes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-stone-400 px-1">
            Unmapped device codes ({unmappedCodes.length})
          </p>
          {unmappedCodes.map((row) => (
            <div key={row.deviceUserCode} className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-amber-800">Code {row.deviceUserCode}</p>
                <p className="text-xs text-amber-700/70">{row.punchCount} punch{row.punchCount === 1 ? "" : "es"}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedWorkerByCode[row.deviceUserCode] || ""}
                  onChange={(e) =>
                    setSelectedWorkerByCode((cur) => ({ ...cur, [row.deviceUserCode]: e.target.value }))
                  }
                  className="flex-1 h-9 rounded-xl border border-amber-200 bg-white px-2 text-sm"
                >
                  <option value="">Assign to employee…</option>
                  {workers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-xl bg-amber-700 hover:bg-amber-800"
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
    </div>
  )
}
