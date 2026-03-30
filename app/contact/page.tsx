"use client"

import { useState } from "react"
import Link from "next/link"
import { Fraunces, Manrope } from "next/font/google"
import { ArrowLeft, Mail, MessageSquare, Send, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const display = Fraunces({ subsets: ["latin"], weight: ["600", "700", "800"] })
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"] })

const INQUIRY_TYPES = [
  { value: "estate-trial", label: "Estate trial / demo" },
  { value: "partnership", label: "Partnership / integration" },
  { value: "incubation", label: "Incubation / investor" },
  { value: "general", label: "General enquiry" },
]

const CONTACT_REASONS = [
  { icon: "🌱", title: "Estate trials", description: "Want to run FarmFlow on your estate or see a live demo before signing up." },
  { icon: "🤝", title: "Partnerships", description: "Integrations, distribution, or co-building within the coffee ecosystem." },
  { icon: "📈", title: "Incubation & investment", description: "Early-stage support, mentorship, or funding conversations." },
  { icon: "💬", title: "General", description: "Anything else — questions, feedback, or just saying hello." },
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
    <div className={`${body.className} min-h-[100svh] bg-[#07110f] text-stone-100`}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_26%),radial-gradient(circle_at_82%_12%,rgba(245,158,11,0.10),transparent_18%),linear-gradient(180deg,#07110f_0%,#091916_42%,#081310_100%)]" />
      </div>

      <main className="relative z-10 mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] hover:text-white" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <Button className="border-emerald-300/40 bg-emerald-300 text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.6)] hover:bg-emerald-200" asChild>
            <Link href="/signup">Create Workspace</Link>
          </Button>
        </div>

        <section className="rounded-3xl border border-white/10 bg-[#0a1714]/92 p-6 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.6)] sm:p-8">
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-200">FarmFlow</p>
          <h1 className={`${display.className} mt-2 text-3xl font-semibold text-stone-50 sm:text-4xl`}>Get in touch</h1>
          <p className="mt-3 max-w-2xl text-sm text-stone-300 sm:text-base">
            Whether you want to run a trial on your estate, explore a partnership, or just ask a question — we read everything and reply personally.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4">
            <Card className="border border-white/10 bg-[#0a1714]/92">
              <CardHeader>
                <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-300/10 text-emerald-200">
                  <Mail className="h-5 w-5" />
                </div>
                <CardTitle className={`${display.className} text-xl text-stone-50`}>Direct email</CardTitle>
                <CardDescription className="text-stone-300">Prefer email? Write to us directly.</CardDescription>
              </CardHeader>
              <CardContent>
                <a
                  href="mailto:hello@thefarmflow.in"
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-4 py-3 text-sm font-medium text-emerald-200 transition hover:border-emerald-300/40 hover:bg-emerald-300/[0.12]"
                >
                  <Mail className="h-4 w-4" />
                  hello@thefarmflow.in
                </a>
                <p className="mt-3 text-xs text-stone-400">We aim to reply within one business day.</p>
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-[#0a1714]/92">
              <CardHeader>
                <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-stone-200">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <CardTitle className={`${display.className} text-xl text-stone-50`}>What we can help with</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {CONTACT_REASONS.map((reason) => (
                  <div key={reason.title} className="flex items-start gap-3">
                    <span className="text-base leading-5">{reason.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-stone-100">{reason.title}</p>
                      <p className="text-xs text-stone-400">{reason.description}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="border border-white/10 bg-[#0a1714]/92">
            <CardHeader>
              <CardTitle className={`${display.className} text-xl text-stone-50`}>Send a message</CardTitle>
              <CardDescription className="text-stone-300">Fill in the form and we'll get back to you.</CardDescription>
            </CardHeader>
            <CardContent>
              {submitted ? (
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-300/10 text-emerald-300">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <div>
                    <p className={`${display.className} text-lg text-stone-50`}>Message received</p>
                    <p className="mt-1 text-sm text-stone-400">We'll reply to {form.email} within one business day.</p>
                  </div>
                  <Button variant="ghost" className="border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08]" asChild>
                    <Link href="/">Back to home</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-stone-300">Your name</Label>
                      <Input
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Ravi Kumar"
                        className="border-white/10 bg-white/[0.04] text-stone-100 placeholder:text-stone-500 focus-visible:border-emerald-300/40 focus-visible:ring-emerald-300/20"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-stone-300">Your email</Label>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="ravi@yourfarm.com"
                        className="border-white/10 bg-white/[0.04] text-stone-100 placeholder:text-stone-500 focus-visible:border-emerald-300/40 focus-visible:ring-emerald-300/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-stone-300">Type of enquiry</Label>
                    <Select value={form.inquiryType} onValueChange={(v) => setForm((f) => ({ ...f, inquiryType: v }))}>
                      <SelectTrigger className="border-white/10 bg-white/[0.04] text-stone-100 focus:ring-emerald-300/20">
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
                    <Label className="text-stone-300">Message</Label>
                    <Textarea
                      value={form.message}
                      onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                      placeholder="Tell us about your estate, what you're looking for, or anything else on your mind."
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
      </main>
    </div>
  )
}
