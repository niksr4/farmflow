import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border-[1.5px] border-border/75 text-sm font-semibold ring-offset-background transition-[color,background-color,box-shadow,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-primary/75 bg-primary text-primary-foreground shadow-[0_8px_16px_-10px_rgba(15,23,42,0.7)] hover:bg-primary/90",
        destructive:
          "border-destructive/70 bg-destructive text-destructive-foreground shadow-[0_8px_16px_-10px_rgba(127,29,29,0.65)] hover:bg-destructive/90",
        outline:
          "border-border/90 bg-white text-foreground shadow-[0_4px_10px_-8px_rgba(15,23,42,0.5)] hover:bg-muted/55 hover:text-foreground",
        secondary:
          "border-border/80 bg-secondary text-secondary-foreground shadow-[0_4px_10px_-8px_rgba(15,23,42,0.45)] hover:bg-secondary/80",
        ghost: "border-border/70 bg-transparent text-foreground/85 hover:bg-muted/55 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
