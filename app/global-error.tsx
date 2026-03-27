"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  // global-error replaces the root layout — must supply <html> and <body>
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#fafaf9" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ maxWidth: "400px", width: "100%", textAlign: "center" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
              <svg width="32" height="32" fill="none" stroke="#ef4444" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>

            <div style={{ marginBottom: "8px", fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#059669" }}>
              FarmFlow
            </div>
            <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#1c1917", margin: "0 0 8px" }}>
              Application error
            </h1>
            <p style={{ fontSize: "14px", color: "#78716c", margin: "0 0 32px", lineHeight: "1.6" }}>
              FarmFlow encountered a critical error. Your estate data is safe. Please refresh the page to continue.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" }}>
              <button
                onClick={reset}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 24px", borderRadius: "12px", background: "#15803d", color: "#fff", fontSize: "14px", fontWeight: 500, border: "none", cursor: "pointer" }}
              >
                Reload app
              </button>
              <a
                href="/"
                style={{ fontSize: "13px", color: "#78716c", textDecoration: "none" }}
              >
                Go to homepage
              </a>
            </div>

            {error.digest && (
              <p style={{ marginTop: "24px", fontSize: "11px", color: "#a8a29e", fontFamily: "monospace" }}>
                Error ID: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}
