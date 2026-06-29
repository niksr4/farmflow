import Image from "next/image"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

function BrandLoading({
  message,
  className,
  compact = false,
}: {
  message?: string
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <Image
        src="/brand-logo.svg"
        alt="FarmFlow"
        width={150}
        height={59}
        className={cn("w-auto animate-pulse", compact ? "h-8" : "h-12")}
        priority
      />
      <Loader2 className={cn("animate-spin text-emerald-600", compact ? "h-4 w-4" : "h-5 w-5")} />
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  )
}

export { BrandLoading }
