"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

type Status = "idle" | "working" | "done" | "error"

export default function VerifyEmailChangePage({ initialToken }: { initialToken: string }) {
  const [status, setStatus] = useState<Status>(initialToken ? "working" : "error")
  const [message, setMessage] = useState(initialToken ? "" : "This confirmation link is missing its token.")

  // A POST must never be aborted (see lib/abortable.ts): cancelling it would report failure for
  // a change the server may have committed. The stale flag stops the setState, not the request —
  // the same exception verify-email-page.tsx makes.
  const ignoreRef = useRef(false)
  useEffect(() => () => {
    ignoreRef.current = true
  }, [])

  const confirm = useCallback(async (token: string) => {
    setStatus("working")
    try {
      const response = await fetch("/api/auth/confirm-email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      const payload = await response.json().catch(() => ({}))
      if (ignoreRef.current) return

      if (!response.ok || !payload?.success) {
        setStatus("error")
        setMessage(String(payload?.error || "Could not confirm the email change"))
        return
      }
      setStatus("done")
      setMessage(String(payload?.message || "Email address updated."))
    } catch {
      if (ignoreRef.current) return
      setStatus("error")
      setMessage("Network error. Please try the link again.")
    }
  }, [])

  useEffect(() => {
    if (!initialToken) return
    void confirm(initialToken)
  }, [initialToken, confirm])

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {status === "done" ? "Email address updated" : status === "working" ? "Confirming…" : "Confirm email change"}
          </CardTitle>
          <CardDescription>
            {status === "done"
              ? "Sign in with your new address from now on."
              : status === "working"
                ? "One moment while we confirm this address."
                : message}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "done" && <p className="text-sm text-muted-foreground">{message}</p>}

          {status === "error" && initialToken && (
            <Button variant="outline" className="w-full" onClick={() => void confirm(initialToken)}>
              Try again
            </Button>
          )}

          {status !== "working" && (
            <Button asChild className="w-full">
              <Link href="/">{status === "done" ? "Go to sign in" : "Back to FarmFlow"}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
