import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const PICKER_TYPES = new Set(["date", "time", "datetime-local", "month", "week"])

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, onClick, ...props }, ref) => {
  // iOS standalone PWAs (home-screen apps) frequently won't open the native date/time picker
  // on a plain tap — the field looks "stuck". Explicitly requesting the picker on tap fixes
  // that; it's a no-op on browsers where the tap already works and is ignored where unsupported.
  const handleClick =
    type && PICKER_TYPES.has(type)
      ? (event: React.MouseEvent<HTMLInputElement>) => {
          onClick?.(event)
          try {
            ;(event.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()
          } catch {
            // showPicker throws if not user-activated or already open — safe to ignore
          }
        }
      : onClick

  return (
    <input
      type={type}
      onClick={handleClick}
      className={cn(
        "flex h-11 w-full rounded-md border-[1.5px] border-input/85 bg-white/90 px-3 py-2 text-base text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(15,23,42,0.08)] ring-offset-background transition-[border-color,box-shadow,background-color] file:border-0 file:bg-transparent file:text-base file:font-medium placeholder:text-muted-foreground/75 focus-visible:border-ring/75 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:text-sm sm:file:text-sm dark:bg-card/80",
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = "Input"

export { Input }
