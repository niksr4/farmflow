"use client"

import { useEffect } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to an error reporting service if available
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
          <a
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-white border border-stone-200 text-stone-700 text-sm font-medium hover:bg-stone-50 transition-colors"
          >
            Back to dashboard
          </a>
        </div>

        {error.digest && (
          <p className="mt-6 text-xs text-stone-400 font-mono">Error ID: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
