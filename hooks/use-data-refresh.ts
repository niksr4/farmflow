"use client"

import { useSyncExternalStore } from "react"

import { FARMFLOW_RECORD_SAVED_EVENT } from "@/components/inventory-system/constants"

/**
 * "Refetch what you are showing", as a value you can put in a dependency array.
 *
 * THE CHANNEL IS THE EXISTING `farmflow:record-saved` WINDOW EVENT, deliberately. That event
 * already existed and is already fired by other-expenses-tab, labor-deployment-tab and
 * picking-log-tab on save, and already listened to by labor-deployment-tab and inventory-system.
 * Introducing a second, parallel refresh mechanism alongside it would mean two things that both
 * mean "reload now", and the next person to add a view would wire up whichever they found first
 * -- the same split-contract failure that had worker types declared in three places.
 *
 * What this adds is only ergonomics. Listening to a window event from a component that loads its
 * data in a `useEffect` means writing a second effect that calls a refetch function, which the
 * effect must then expose; exposing a counter instead lets the *existing* effect re-run by adding
 * one name to its dependency array. Same channel, less ceremony.
 *
 * WHY IT WAS NEEDED. The Sync button called `refreshData()` in inventory-system.tsx, which
 * refetches `/api/inventory-neon` and `/api/transactions-neon` -- both *stock*. Every other tab
 * loads its own data in its own effect and was listening to nothing. So a button labelled "Sync"
 * refreshed one tab's worth of the app: on 2026-08-25 a writer saved an expense, an admin pressed
 * Sync, and nothing appeared until the page was fully reloaded -- which worked only because a
 * reload remounts everything and re-runs every effect. The button was not throwing; it did
 * exactly what it was wired to do, and that was not what its label promised.
 */

let nonce = 0
const listeners = new Set<() => void>()

/** Ask every view to refetch. Fires the same event a save fires, so existing listeners react too. */
export function requestDataRefresh(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(FARMFLOW_RECORD_SAVED_EVENT))
}

const subscribe = (listener: () => void): (() => void) => {
  if (listeners.size === 0 && typeof window !== "undefined") {
    window.addEventListener(FARMFLOW_RECORD_SAVED_EVENT, onEvent)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener(FARMFLOW_RECORD_SAVED_EVENT, onEvent)
    }
  }
}

function onEvent() {
  nonce += 1
  for (const listener of listeners) {
    // One misbehaving subscriber must not stop the others being told.
    try {
      listener()
    } catch {
      /* ignore */
    }
  }
}

const getSnapshot = () => nonce
/** Always 0 on the server: this only changes in response to a browser action, so it cannot mismatch on hydration. */
const getServerSnapshot = () => 0

/**
 * A number that changes whenever anything asks for a refresh — a save anywhere in the app, or
 * the Sync button. Put it in the dependency array of the effect that already loads your data.
 */
export function useDataRefresh(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
