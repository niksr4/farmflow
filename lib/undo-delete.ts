"use client"

import { toast } from "sonner"

const UNDO_WINDOW_MS = 5000

/**
 * Delete with a 5-second undo window instead of a blocking confirm dialog.
 *
 * Call `onHide` immediately (optimistically remove the row from the UI),
 * show an undo toast, and only run `onDelete` (the real API call) after the
 * window closes. Undo calls `onRestore` and never touches the API.
 */
export function deleteWithUndo({
  description,
  onHide,
  onRestore,
  onDelete,
}: {
  /** What's being deleted, e.g. "Labour entry · 14-Jul-2026" */
  description: string
  onHide: () => void
  onRestore: () => void
  onDelete: () => void | Promise<void>
}) {
  let undone = false
  let fired = false
  onHide()

  /**
   * Run the delete now, at most once.
   *
   * REPORTED BY HONEYFARM 2026-08-31: "it says it worked but when I reload, it's back." Two
   * separate bugs produced that sentence; this is the one that sent no request at all. The row
   * hides and the toast says Deleted immediately, but the API call waited five seconds. Leave the
   * page inside that window -- reload, hit back, switch app on a phone -- and the timer dies with
   * the document. Nothing was ever asked of the server, nothing failed, and there was no error to
   * see, because no request existed.
   *
   * Five seconds is a long time on a phone. Deleting a row and immediately navigating is ordinary
   * behaviour, not an edge case.
   */
  const flush = () => {
    if (undone || fired) return
    fired = true
    clearTimeout(timer)
    // onHide() already removed the row from the UI and the toast already said "Deleted" --
    // if the real request now fails, that's the other half of the HoneyFarm report above: a
    // failure here previously had nowhere to go (an unhandled rejection) and the row stayed
    // hidden even though nothing was ever written. Put it back and say so.
    Promise.resolve(onDelete()).catch((err) => {
      onRestore()
      toast.error(`Couldn't delete ${description}. It's been restored -- please try again.`)
      console.error(`[deleteWithUndo] onDelete failed for "${description}"`, err)
    })
  }

  const timer = setTimeout(flush, UNDO_WINDOW_MS)

  // pagehide, not beforeunload: iOS Safari does not reliably fire beforeunload, and the crash
  // beacon already learned that lesson the hard way. visibilitychange covers the app-switch case,
  // where the page is never unloaded but may be discarded under memory pressure.
  //
  // NOTE FOR CALLERS: onDelete should use `fetch(..., { keepalive: true })` so the request
  // survives the document being torn down. Firing it here is necessary but not sufficient without
  // that flag.
  const onPageHide = () => flush()
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush()
  }
  window.addEventListener("pagehide", onPageHide)
  document.addEventListener("visibilitychange", onVisibility)

  const cleanup = () => {
    window.removeEventListener("pagehide", onPageHide)
    document.removeEventListener("visibilitychange", onVisibility)
  }
  // Whichever way this ends -- flushed, undone, or the window simply elapsing -- stop listening.
  window.setTimeout(cleanup, UNDO_WINDOW_MS + 250)

  toast(`Deleted ${description}`, {
    duration: UNDO_WINDOW_MS,
    action: {
      label: "Undo",
      onClick: () => {
        undone = true
        clearTimeout(timer)
        cleanup()
        onRestore()
      },
    },
  })
}
