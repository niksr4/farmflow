import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border-[1.5px] px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.04em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring/35 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-primary/75 bg-primary text-primary-foreground hover:bg-primary/85",
        secondary: "border-border/80 bg-secondary text-secondary-foreground hover:bg-secondary/85",
        destructive: "border-destructive/75 bg-destructive text-destructive-foreground hover:bg-destructive/85",
        outline: "border-border/90 bg-white/80 text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
