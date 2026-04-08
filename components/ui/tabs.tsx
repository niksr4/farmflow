"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "flex w-full max-w-full flex-nowrap items-center justify-start gap-1.5 overflow-x-auto whitespace-nowrap rounded-[20px] border border-border/80 bg-gradient-to-b from-white/95 via-white/90 to-muted/40 p-1.5 text-foreground/90 no-scrollbar shadow-[0_12px_28px_-24px_rgba(15,23,42,0.45)] backdrop-blur-sm sm:flex-wrap dark:border-slate-800 dark:from-slate-900/90 dark:via-slate-900/85 dark:to-slate-900/70 dark:text-slate-100",
      className,
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex min-h-11 touch-manipulation items-center justify-center whitespace-nowrap rounded-full border border-transparent px-4 py-2.5 text-[15px] font-medium text-slate-600 ring-offset-background transition-all hover:border-border/75 hover:bg-white hover:text-slate-900 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:text-sm data-[state=active]:border-border/70 data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-slate-950 data-[state=active]:shadow-[0_10px_22px_-16px_rgba(15,23,42,0.55)] dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-100 dark:data-[state=active]:border-slate-700 dark:data-[state=active]:bg-slate-100 dark:data-[state=active]:text-slate-900 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-current",
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 data-[state=inactive]:hidden ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
