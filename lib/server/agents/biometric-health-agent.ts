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
 * WORKING DAYS, NOT HOURS -- and the hours version was wrong in a way only production showed.
 *
 * The old rule was "12+ hours of silence", justified by "an estate cutting power at night ... half
 * a day of total silence is not explicable by either". Six in the evening to half seven the next
 * morning is thirteen and a half hours. The cron runs at 02:00 UTC, which is 07:30 in Kodagu --
 * so on any estate that switches the muster shed off overnight this fired EVERY morning, and after
 * a weekend it fired at sixty-odd hours. HoneyFarm got exactly that: "silent for 15h", on a
 * terminal that was working perfectly.
 *
 * An alert that arrives every morning is an alert nobody reads, and the one morning it means
 * something is the morning it gets deleted with the others.
 *
 * So the question changes from "how long has it been quiet" to "did it miss a day the estate was
 * working". A terminal seen at any point during the last working day is fine, whatever it did
 * overnight. One that has not been seen since before then has missed a whole day of attendance,
 * which is worth an email.
 *
 * Sunday is the weekly off everywhere in this product (WEEKLY_OFF_DOW in lib/attendance-monthly),
 * so Monday morning compares against Saturday and a normal weekend is silent by design.
 *
 * COST: up to one working day of detection latency. Acceptable, and the doc below already says
 * why -- the device buffers ~150,000 records and retries until acknowledged, so nothing is lost.
 * The failure this exists to catch is an estate spending a fortnight assuming attendance was being
 * captured, not a terminal being off for a morning.
 */
const DEFAULT_SILENCE_HOURS = 12

/**
 * Backstop for an estate that does not take Sundays off, or works a pattern this does not model.
 * Three full days of silence is not a weekend anywhere.
 */
const ABSOLUTE_SILENCE_HOURS = 72

/**
 * Is this terminal's silence worth an email?
 *
 * Pulled out of the filter so it can be tested against the cases that actually occur -- the SQL
 * supplies the two facts, this decides. The version this replaced was a `>= 12` inside a filter,
 * which is exactly the kind of rule that reads as obviously correct and fires every morning.
 */
export function shouldAlertForSilence(input: {
  hoursSilent: number
  /** False only when the device was not seen at any point during the last working day. */
  seenLastWorkingDay: boolean | null
  silenceHours: number
}): boolean {
  const hours = Number(input.hoursSilent) || 0
  // Past any weekend or overnight shutdown pattern, so it stands on its own.
  if (hours >= ABSOLUTE_SILENCE_HOURS) return true
  // A terminal alive yesterday is healthy however dark it went overnight.
  if (input.seenLastWorkingDay !== false) return false
  return hours >= input.silenceHours
}

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
        ROUND(EXTRACT(EPOCH FROM (NOW() - d.last_seen_at)) / 3600)::int AS hours_silent,
        -- Did it check in at any point during the last day the estate was working?
        --
        -- All of this is in Asia/Kolkata: the rows are UTC and "yesterday" at 02:00 UTC is a
        -- different date in India, which is the timezone the estate's day is actually lived in.
        -- The previous working day is the latest date before today that is not a Sunday, so a
        -- Monday check looks back at Saturday and an ordinary weekend never trips it.
        (
          (d.last_seen_at AT TIME ZONE 'Asia/Kolkata')::date >=
          (
            SELECT MAX(day)::date
            FROM generate_series(
              ((NOW() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '7 days'),
              ((NOW() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '1 day'),
              INTERVAL '1 day'
            ) AS day
            WHERE EXTRACT(DOW FROM day) <> 0
          )
        ) AS seen_last_working_day
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
      seen_last_working_day: boolean | null
    }>

    // A device that has NEVER checked in is not yet an incident -- it was probably registered
    // minutes ago and is still being configured. Only devices that were once alive and have
    // since gone quiet are worth waking someone for.
    const silent = rows
      .filter(
        (row) =>
          row.last_seen_at !== null &&
          shouldAlertForSilence({
            hoursSilent: Number(row.hours_silent) || 0,
            seenLastWorkingDay: row.seen_last_working_day,
            silenceHours,
          }),
      )
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
        `${silent.length} registered terminal(s) missed a full working day.`,
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
        "",
        "Overnight and weekend silence is NOT reported: a terminal seen at any point during the",
        "last working day is treated as healthy, whatever it did after hours.",
      ].join("\n"),
    })

    return { checked: rows.length, silent, alerted: true }
  } catch (error) {
    // Never let a monitoring check take the orchestrator down with it.
    logServerError("Biometric health agent failed", error)
    return { checked: 0, silent: [], alerted: false, skippedReason: "error" }
  }
}
