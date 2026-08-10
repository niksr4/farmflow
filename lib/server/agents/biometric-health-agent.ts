import "server-only"

// Cron context, across every tenant, so this uses the RLS-bypassing owner connection rather than
// app_runtime -- which requires a per-request app.tenant_id this code never has.
import { adminSql as sql } from "@/lib/server/db"
import { sendAgentAlertEmail } from "@/lib/server/agents/alert-email"
import { logServerError } from "@/lib/server/safe-logging"

/**
 * Notices when a fingerprint terminal has gone quiet.
 *
 * A registered terminal polls roughly every 20 seconds, so silence is unambiguous. What makes
 * this worth a dedicated check is that EVERY way it can break is silent:
 *
 *   - the relay host is reclaimed (Always Free reclaims idle instances, and a relay handling a
 *     few punches a day is exactly that)
 *   - the relay's public IP changes
 *   - the estate loses internet or power
 *   - somebody edits ServerIP on the device
 *
 * None of these produce an error anywhere in FarmFlow. The attendance tab simply shows nobody
 * punching, which is indistinguishable from nobody turning up. The device buffers ~150,000
 * records and retries until acknowledged, so this is recoverable -- but only if someone notices
 * before the estate has spent a fortnight assuming attendance was being captured.
 *
 * Detection is deliberately on last_seen_at rather than on reaching the relay: the heartbeat
 * covers every failure above at once, including the ones a relay ping would miss.
 */

/**
 * Generous on purpose. The terminal polls 24/7 while powered, so even overnight it should be
 * seen -- but an estate cutting power at night, or flaky rural WiFi, must not page anyone. Half
 * a day of total silence is not explicable by either.
 */
const DEFAULT_SILENCE_HOURS = 12

export type BiometricHealthResult = {
  checked: number
  silent: Array<{ tenant: string; serial: string; label: string; hoursSilent: number }>
  alerted: boolean
  skippedReason?: string
}

export async function runBiometricHealthAgent(input?: {
  silenceHours?: number
  dryRun?: boolean
}): Promise<BiometricHealthResult> {
  const silenceHours = Number(input?.silenceHours ?? process.env.BIOMETRIC_SILENCE_HOURS ?? DEFAULT_SILENCE_HOURS)

  if (!sql) return { checked: 0, silent: [], alerted: false, skippedReason: "Database not configured" }

  try {
    const rows = (await sql`
      SELECT
        t.name AS tenant_name,
        d.serial_number,
        COALESCE(d.label, '') AS label,
        d.last_seen_at,
        ROUND(EXTRACT(EPOCH FROM (NOW() - d.last_seen_at)) / 3600)::int AS hours_silent
      FROM biometric_devices d
      JOIN tenants t ON t.id = d.tenant_id
      WHERE d.active = TRUE
      ORDER BY t.name, d.serial_number
    `) as Array<{
      tenant_name: string
      serial_number: string
      label: string
      last_seen_at: string | null
      hours_silent: number | null
    }>

    // A device that has NEVER checked in is not yet an incident -- it was probably registered
    // minutes ago and is still being configured. Only devices that were once alive and have
    // since gone quiet are worth waking someone for.
    const silent = rows
      .filter((row) => row.last_seen_at !== null && Number(row.hours_silent) >= silenceHours)
      .map((row) => ({
        tenant: String(row.tenant_name),
        serial: String(row.serial_number),
        label: String(row.label || ""),
        hoursSilent: Number(row.hours_silent) || 0,
      }))

    if (!silent.length || input?.dryRun) {
      return { checked: rows.length, silent, alerted: false, skippedReason: input?.dryRun ? "dryRun" : undefined }
    }

    const lines = silent.map(
      (d) => `- ${d.tenant}: ${d.label || d.serial} (${d.serial}) — silent for ${d.hoursSilent}h`,
    )
    await sendAgentAlertEmail({
      subject: `FarmFlow: ${silent.length} fingerprint terminal(s) have gone quiet`,
      text: [
        `${silent.length} registered terminal(s) have not checked in for ${silenceHours}+ hours.`,
        "",
        ...lines,
        "",
        "A terminal polls every ~20s while powered and online, so this means one of:",
        "  - the ingest relay is down, reclaimed, or its IP changed",
        "  - the estate has lost internet or power",
        "  - the device's ServerIP/ServerPort was changed",
        "",
        "Punches are NOT lost while this persists: the device buffers and retries until it is",
        "acknowledged. They will drain once the path is restored.",
      ].join("\n"),
    })

    return { checked: rows.length, silent, alerted: true }
  } catch (error) {
    // Never let a monitoring check take the orchestrator down with it.
    logServerError("Biometric health agent failed", error)
    return { checked: 0, silent: [], alerted: false, skippedReason: "error" }
  }
}
