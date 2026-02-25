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
      "flex w-full max-w-full flex-wrap items-start justify-start gap-1 rounded-lg border-[1.5px] border-border/85 bg-gradient-to-b from-white/95 to-muted/40 p-2 text-foreground/90 backdrop-blur-sm shadow-[0_8px_20px_-16px_rgba(15,23,42,0.5)] dark:from-slate-900/90 dark:to-slate-900/75 dark:text-slate-100",
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
      "inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-md border border-transparent bg-transparent px-3.5 py-2.5 text-sm font-semibold text-neutral-700 ring-offset-background transition-all hover:border-border/75 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary/75 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_8px_18px_-12px_rgba(15,23,42,0.65)] dark:text-slate-200 dark:hover:bg-slate-800/70 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-neutral-500 data-[state=active]:[&_svg]:text-white",
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
      "mt-2 data-[state=inactive]:hidden ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
