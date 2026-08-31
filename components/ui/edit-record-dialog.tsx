"use client"

import type React from "react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

/**
 * Editing an existing record opens that record, where you clicked it.
 *
 * THE RULE. Anywhere the app lists saved records and lets you change one, pressing Edit opens the
 * record in this dialog. It does not switch you to another section, it does not fill in a form
 * somewhere else and leave you to find it, and it does not build a second copy of the entry form.
 *
 * WHY IT IS A COMPONENT AND NOT A NOTE IN A STYLE GUIDE. Reported by HoneyFarm 2026-08-31:
 * pressing Edit on an expense in History appeared to do nothing. It had in fact filled the entry
 * form -- in the "form" section, which the writer was not looking at -- so the fix was to navigate
 * back and find it. Nobody designed that; the edit path simply reused whatever the entry path
 * already had, on a screen where the entry path lived elsewhere. Every tab that lists records has
 * the same shape and so the same trap.
 *
 * PASS THE SAME FORM NODE YOU RENDER INLINE. Not a copy of it. An edit form that has drifted from
 * the entry form is how a field comes to save on one screen and not the other, which this codebase
 * has already paid for twice -- the expense block picker, and the pay basis on the worker roster,
 * where three of four editors followed the worker type and the fourth did not.
 *
 * ```tsx
 * const formNode = <form onSubmit={handleSubmit}>…</form>
 *
 * {isAdding && !editingId ? formNode : null}
 *
 * <EditRecordDialog
 *   open={editingId != null}
 *   onClose={resetForm}
 *   title="Edit expense"
 *   description="Saving replaces the record and recalculates the stock it drew on."
 * >
 *   {formNode}
 * </EditRecordDialog>
 * ```
 */
export function EditRecordDialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean
  /** Called on any dismissal — backdrop, Escape, or the close button. Reset your form here. */
  onClose: () => void
  title: string
  /** One line on what saving will do. Say the consequence, not the mechanics. */
  description?: string
  children: React.ReactNode
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      {/* Scrolls inside itself: these forms are long, and a dialog taller than the viewport
          strands the save button off-screen on a phone. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <div className="space-y-1 pb-2">
          <DialogTitle className="text-base font-bold text-stone-700 dark:text-stone-200">{title}</DialogTitle>
          {description ? <p className="text-xs text-stone-400">{description}</p> : null}
        </div>
        {children}
      </DialogContent>
    </Dialog>
  )
}
