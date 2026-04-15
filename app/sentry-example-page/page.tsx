"use client"

import * as Sentry from "@sentry/nextjs"

export default function SentryExamplePage() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        background: "#fff",
        color: "#111",
        fontFamily: "sans-serif",
        zIndex: 9999,
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Sentry Verification</h1>
      <p style={{ margin: 0, color: "#555", fontSize: 14 }}>
        Click a button to send a test error to Sentry.
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={() => {
            Sentry.captureException(new Error("FarmFlow client-side Sentry test"))
            alert("Client error sent to Sentry — check your dashboard.")
          }}
          style={{ padding: "10px 20px", background: "#e53e3e", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
        >
          Client error
        </button>
        <a
          href="/api/sentry-example"
          target="_blank"
          style={{ padding: "10px 20px", background: "#805ad5", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          Server error
        </a>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "#999" }}>Delete this page once verified.</p>
    </div>
  )
}
