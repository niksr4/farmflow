"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function SignupRoute() {
  const [submitted, setSubmitted] = useState(false)

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <Card className="border border-white/60 bg-white/85 backdrop-blur-md dark:bg-slate-900/75">
          <CardHeader>
            <CardTitle>Request Access</CardTitle>
            <CardDescription>
              Tell us about your estate and we will set up your tenant in minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Thanks. We will reach out with your login details shortly.
                </p>
                <Button asChild className="w-full">
                  <Link href="/login">Go to Sign In</Link>
                </Button>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  setSubmitted(true)
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" placeholder="Your name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Work Email</Label>
                  <Input id="email" type="email" placeholder="you@estate.com" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estate">Estate Name</Label>
                  <Input id="estate" placeholder="Estate or cooperative name" required />
                </div>
                <Button type="submit" className="w-full">
                  Request Access
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <div className="text-center text-sm text-muted-foreground">
          Already have access?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
