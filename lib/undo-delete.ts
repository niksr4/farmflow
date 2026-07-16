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
  onHide()

  const timer = setTimeout(() => {
    if (!undone) void onDelete()
  }, UNDO_WINDOW_MS)

  toast(`Deleted ${description}`, {
    duration: UNDO_WINDOW_MS,
    action: {
      label: "Undo",
      onClick: () => {
        undone = true
        clearTimeout(timer)
        onRestore()
      },
    },
  })
}
