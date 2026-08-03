"use client"

import { FormEvent, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import WorkspaceNavigatorBackButton from "@/components/workspace-navigator-back-button"
import { useToast } from "@/hooks/use-toast"

/**
 * Sibling of /settings/reset-password, and gated the same way — which is to say, not by role.
 *
 * app/settings/page.tsx redirects role=user to /dashboard, so a writer never sees the tenant
 * settings screen. Their password page has always lived outside that redirect; their email page
 * needs to as well, or "change your own email" would silently mean "unless you're a writer".
 */
export default function ChangeEmailPage() {
  const { toast } = useToast()
  const [newEmail, setNewEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [sentTo, setSentTo] = useState("")

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setIsSaving(true)

    try {
      const response = await fetch("/api/account/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, currentPassword }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok || !payload?.success) {
        setError(String(payload?.error || "Could not start the email change"))
        return
      }

      setSentTo(String(payload?.message || ""))
      setNewEmail("")
      setCurrentPassword("")
      toast({ title: "Confirmation sent", description: "Check the new address to finish." })
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8 space-y-4">
      <WorkspaceNavigatorBackButton />
      <Card>
        <CardHeader>
          <CardTitle>Change email address</CardTitle>
          <CardDescription>
            We&apos;ll send a confirmation link to the new address. Your current email keeps working until you
            confirm, and we&apos;ll let your old address know a change was requested.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sentTo ? (
            <p className="text-sm text-muted-foreground">{sentTo}</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newEmail">New email address</Label>
                <Input
                  id="newEmail"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Required so that a signed-in session alone can&apos;t move your account.
                </p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={isSaving}>
                {isSaving ? "Sending…" : "Send confirmation link"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
