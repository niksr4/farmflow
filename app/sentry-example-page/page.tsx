"use client"

import * as Sentry from "@sentry/nextjs"
import { useState } from "react"

export default function SentryExamplePage() {
  const [serverError, setServerError] = useState<string | null>(null)

  const triggerClientError = () => {
    Sentry.captureException(new Error("FarmFlow Sentry client-side test error"))
    throw new Error("FarmFlow Sentry client-side test error")
  }

  const triggerServerError = async () => {
    setServerError(null)
    const res = await fetch("/api/sentry-example")
    const data = await res.json().catch(() => ({}))
    setServerError(data?.error ?? "Server error triggered — check Sentry")
  }

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 480 }}>
      <h1>Sentry Verification</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Click a button to send a test error to Sentry. Check your Sentry dashboard for the issue.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={triggerClientError}
          style={{ padding: "10px 20px", background: "#e53e3e", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          Trigger client error
        </button>
        <button
          onClick={triggerServerError}
          style={{ padding: "10px 20px", background: "#805ad5", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          Trigger server error
        </button>
      </div>
      {serverError && (
        <p style={{ marginTop: 16, color: "#805ad5", fontSize: 14 }}>{serverError}</p>
      )}
      <p style={{ marginTop: 32, fontSize: 12, color: "#999" }}>
        Delete this page once Sentry is verified.
      </p>
    </div>
  )
}
