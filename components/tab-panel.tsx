"use client"

import { Component, type ReactNode } from "react"
import * as Sentry from "@sentry/nextjs"
import { TabsContent } from "@/components/ui/tabs"
import { AlertTriangle } from "lucide-react"

/**
 * A workspace tab that cannot take the rest of the app down with it.
 *
 * ⚠ THERE WAS NO REACT ERROR BOUNDARY ANYWHERE IN THIS CODEBASE. Twenty-seven tab panels render
 * inside one route segment, so a throw while rendering ANY of them propagated to app/error.tsx and
 * replaced the whole workspace with "Something went wrong". On a phone in a field that means a
 * failure in, say, Market News blanks the muster somebody is standing there to fill in.
 *
 * The owner reports this screen appearing often enough on the PWA to keep reloading past it. This
 * does not identify the cause -- and I could not, because until #115 the boundary that catches
 * these reported the error nowhere at all. What it does is reduce the blast radius from "the app"
 * to "one tab", and name the tab in Sentry so the next occurrence is diagnosable.
 *
 * WHY A CLASS COMPONENT: React has no hook equivalent. getDerivedStateFromError and
 * componentDidCatch are only available this way, and `react-error-boundary` is not a dependency
 * here. This is the one legitimate class component in the tree.
 */

type TabErrorBoundaryProps = {
  /** The tab's value, used as the Sentry tag and in the message shown to the user. */
  tab: string
  children: ReactNode
}

class TabErrorBoundary extends Component<TabErrorBoundaryProps, { failed: boolean }> {
  constructor(props: TabErrorBoundaryProps) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    /**
     * Tagged with the tab, because "which screen" is the first question and the stack alone does
     * not answer it reliably once the bundle is minified. `tab` is a fixed vocabulary of 27
     * values, so it is safe as a tag rather than a context field -- searchable and alertable.
     */
    Sentry.captureException(error, {
      tags: { boundary: "workspace-tab", tab: this.props.tab },
      contexts: info.componentStack
        ? { react: { componentStack: info.componentStack } }
        : undefined,
    })
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-500" />
          <div className="min-w-0">
            <p className="font-semibold text-stone-900 dark:text-stone-100">
              This tab could not be shown
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing you entered has been lost, and the other tabs still work. Switch away and back
              to try again, or reload if it keeps happening. We have been told about it.
            </p>
          </div>
        </div>
      </div>
    )
  }
}

/**
 * Drop-in replacement for `<TabsContent>` that wraps the panel in its own error boundary.
 *
 * Props pass straight through, so `className` and `forceMount` behave exactly as before. The
 * boundary sits INSIDE TabsContent rather than around it, so Radix still owns mounting and the
 * failed panel keeps its place in the layout instead of collapsing.
 */
export default function TabPanel({
  value,
  children,
  ...rest
}: React.ComponentProps<typeof TabsContent>) {
  return (
    <TabsContent value={value} {...rest}>
      <TabErrorBoundary tab={String(value)}>{children}</TabErrorBoundary>
    </TabsContent>
  )
}
