"use client"

import { useEffect } from "react"
import Link from "next/link"
import * as Sentry from "@sentry/nextjs"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  /**
   * ⚠ THIS SAID "Log to an error reporting service if available" AND DID NOT.
   *
   * console.error on a phone goes nowhere. So every time an estate saw this screen -- and the
   * owner reports seeing it often enough on the PWA to keep reloading -- the error was displayed
   * to the user and recorded in no system. app/global-error.tsx has called captureException the
   * whole time, but that boundary only fires when the ROOT LAYOUT itself throws, which is rare.
   * This one catches nearly everything, and it was the blind one.
   *
   * Why no data existed to diagnose it: Sentry's onRequestError covers errors thrown out of route
   * handlers and RSC renders, which is why the server side looked healthy -- 13 error groups in
   * seven days and twelve of them a module gate correctly refusing the smoke run. A CLIENT render
   * error reached this file and stopped here.
   *
   * The digest is attached as a tag, not just left in the body, so the Error ID the user can read
   * off the screen is searchable in Sentry. Someone saying "it said Error ID 3f2a1b" is the only
   * bridge between a phone in a field and a stack trace.
   */
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: "app/error", digest: error.digest ?? "none" },
    })
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-stone-900 mb-2">Something went wrong</h1>
        <p className="text-sm text-stone-500 mb-8 leading-relaxed">
          An unexpected error occurred. Your data is safe — please try again or return to the dashboard.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-white border border-stone-200 text-stone-700 text-sm font-medium hover:bg-stone-50 transition-colors"
          >
            Back to dashboard
          </Link>
        </div>

        {error.digest && (
          <p className="mt-6 text-xs text-stone-400 font-mono">Error ID: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
