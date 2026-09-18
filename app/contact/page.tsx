"use client"

import { useState } from "react"
import Link from "next/link"
import { CheckCircle2, Handshake, Mail, MessageCircle, MessageSquare, Send, Sprout, TrendingUp } from "lucide-react"
import { DEFAULT_SUPPORT_EMAIL } from "@/lib/email-addresses"
import { PublicSiteShell } from "@/components/public-site-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const INQUIRY_TYPES = [
  { value: "estate-trial", label: "Estate trial / demo" },
  { value: "partnership", label: "Partnership / integration" },
  { value: "incubation", label: "Funding / mentorship" },
  { value: "general", label: "General enquiry" },
]

const CONTACT_REASONS = [
  { icon: Sprout, title: "Running it on your estate", description: "You want a look at it working on real records before you hand over an email address." },
  { icon: Handshake, title: "Working together", description: "Integrations, distribution, or building something alongside us for estate farming." },
  { icon: TrendingUp, title: "Backing us", description: "Early stage investors, advisors and incubators. We will tell you the honest numbers." },
  { icon: MessageCircle, title: "Anything else", description: "A question, a complaint, a correction, or telling us we got something wrong." },
]

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", inquiryType: "general", message: "" })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to send message")
      setSubmitted(true)
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try emailing us directly.")
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = form.name.trim() && form.email.trim() && form.message.trim().length >= 10

  return (
    <PublicSiteShell theme="dark">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="pt-4 text-center sm:pt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-400/90">Get in touch</p>
          <h1 className="mx-auto mt-4 max-w-2xl text-balance font-display text-[2.4rem] font-semibold leading-[1.08] tracking-[-0.025em] text-stone-50 sm:text-5xl">
            A real person reads these
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-8 text-stone-400">
            There is no support queue and no ticket number. Write about your estate, a problem you
            have hit, or something on the site that is plainly wrong, and you get an answer back
            from whoever can actually do something about it.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4">
            <Card className="border border-white/10 bg-[#0a1714]/92">
              <CardHeader>
                <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-300/10 text-emerald-200">
                  <Mail className="h-5 w-5" />
                </div>
                <CardTitle className="font-display text-xl text-stone-50">Straight to the inbox</CardTitle>
                <CardDescription className="text-stone-300">Skip the form if you would rather just write.</CardDescription>
              </CardHeader>
              <CardContent>
                <a
                  href={`mailto:${DEFAULT_SUPPORT_EMAIL}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-4 py-3 text-sm font-medium text-emerald-200 transition hover:border-emerald-300/40 hover:bg-emerald-300/[0.12]"
                >
                  <Mail className="h-4 w-4" />
                  {DEFAULT_SUPPORT_EMAIL}
                </a>
                <p className="mt-3 text-xs text-stone-400">Usually answered the same day, and always within one working day.</p>
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-[#0a1714]/92">
              <CardHeader>
                <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-stone-200">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <CardTitle className="font-display text-xl text-stone-50">What people usually write about</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3.5">
                {CONTACT_REASONS.map((reason) => {
                  const Icon = reason.icon
                  return (
                    <div key={reason.title} className="flex items-start gap-3">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04]">
                        <Icon className="h-3.5 w-3.5 text-emerald-300" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-stone-100">{reason.title}</p>
                        <p className="text-xs leading-5 text-stone-400">{reason.description}</p>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>

          <Card className="border border-white/10 bg-[#0a1714]/92">
            <CardHeader>
              <CardTitle className="font-display text-xl text-stone-50">Send a message</CardTitle>
              <CardDescription className="text-stone-300">Four fields, and then it is with us.</CardDescription>
            </CardHeader>
            <CardContent>
              {submitted ? (
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-300/10 text-emerald-300">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="font-display text-lg text-stone-50">That has reached us</p>
                    <p className="mt-1 text-sm text-stone-400">You will hear back at {form.email}, usually the same day.</p>
                  </div>
                  <Button variant="ghost" className="border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08]" asChild>
                    <Link href="/">Back to home</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-name" className="text-stone-300">Your name</Label>
                      <Input
                        id="contact-name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Ravi Kumar"
                        className="border-white/10 bg-white/[0.04] text-stone-100 placeholder:text-stone-500 focus-visible:border-emerald-300/40 focus-visible:ring-emerald-300/20"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-email" className="text-stone-300">Your email</Label>
                      <Input
                        id="contact-email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="ravi@yourfarm.com"
                        className="border-white/10 bg-white/[0.04] text-stone-100 placeholder:text-stone-500 focus-visible:border-emerald-300/40 focus-visible:ring-emerald-300/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="contact-inquiry-type" className="text-stone-300">Type of enquiry</Label>
                    <Select value={form.inquiryType} onValueChange={(v) => setForm((f) => ({ ...f, inquiryType: v }))}>
                      <SelectTrigger id="contact-inquiry-type" className="border-white/10 bg-white/[0.04] text-stone-100 focus:ring-emerald-300/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#0d1f1b] text-stone-100">
                        {INQUIRY_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value} className="focus:bg-white/[0.06] focus:text-stone-100">
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="contact-message" className="text-stone-300">Message</Label>
                    <Textarea
                      id="contact-message"
                      value={form.message}
                      onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                      placeholder="Where the estate is, roughly how many acres, and what you are trying to sort out."
                      rows={5}
                      className="border-white/10 bg-white/[0.04] text-stone-100 placeholder:text-stone-500 focus-visible:border-emerald-300/40 focus-visible:ring-emerald-300/20 resize-none"
                    />
                  </div>

                  {error && (
                    <p className="rounded-xl border border-red-400/20 bg-red-400/[0.07] px-3 py-2 text-sm text-red-300">{error}</p>
                  )}

                  <Button
                    disabled={submitting || !canSubmit}
                    onClick={handleSubmit}
                    className="w-full border-emerald-300/40 bg-emerald-300 text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.5)] hover:bg-emerald-200 disabled:opacity-50"
                  >
                    {submitting ? "Sending…" : "Send message"}
                    {!submitting && <Send className="ml-2 h-4 w-4" />}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PublicSiteShell>
  )
}
