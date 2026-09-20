"use client"

/**
 * Public trust page.
 *
 * Wrapped in PublicSiteShell rather than hand-rolling a background and a lone Back button:
 * this page is reached from the footer of every other page, and the bespoke chrome dropped
 * the visitor somewhere with no navigation out except the browser's back arrow.
 *
 * House rule: no em dashes in anything a visitor reads. Claims here have to be literally
 * true, so each one names the mechanism rather than the reassurance.
 */

import Link from "next/link"
import { Check, FileText, KeyRound, Shield } from "lucide-react"
import { PublicSiteShell } from "@/components/public-site-shell"
import { Button } from "@/components/ui/button"

const PRIVACY_COMMITMENTS = [
  "Your operational records are not sold, not shared, and not used to train anything. They are yours.",
  "Isolation is enforced by the database itself, not only by careful queries, so another estate cannot read your rows even by accident.",
  "You decide which screens each person on your estate gets, and every change is written to an audit trail you can read.",
  "Export any of it, as CSV or PDF, whenever you want, at no charge. If you leave, the export still works.",
]

const TERMS_SUMMARY = [
  "FarmFlow gives you records and reports. It does not give financial or legal advice, and the judgement about your estate stays yours.",
  "Whoever you make an admin is responsible for what gets typed in and for who else they let through the door.",
  "Service changes are announced before they happen, and updates are built so your existing records survive them.",
]

const LEGAL_DOCS = [
  { href: "/privacy", label: "Privacy Notice" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/dpa", label: "Data Processing Addendum" },
  { href: "/legal/billing", label: "Billing and Cancellation" },
  { href: "/legal/subprocessors", label: "Subprocessors" },
]

function CommitmentCard({
  icon: Icon,
  title,
  lede,
  items,
  iconClass,
}: {
  icon: typeof Shield
  title: string
  lede: string
  items: string[]
  iconClass: string
}) {
  return (
    <section className="rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.05] to-transparent p-7 sm:p-8">
      <span className={`grid h-10 w-10 place-items-center rounded-xl border ${iconClass}`}>
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="mt-4 font-display text-[1.5rem] font-semibold text-stone-50">{title}</h2>
      <p className="mt-2 text-[14px] leading-7 text-stone-400">{lede}</p>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-[13.5px] leading-6 text-stone-300">
            <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function TrustPage() {
  return (
    <PublicSiteShell theme="dark">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="pt-4 text-center sm:pt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-400/90">
            Trust and privacy
          </p>
          <h1 className="mx-auto mt-4 max-w-2xl text-balance font-display text-[2.4rem] font-semibold leading-[1.08] tracking-[-0.025em] text-stone-50 sm:text-5xl">
            Your season is nobody else&apos;s business
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-8 text-stone-400">
            What an estate types into FarmFlow is commercially sensitive: your yields, your wage
            bill, what your buyer paid. Here is exactly who can see it, and what you are agreeing
            to when you sign up.
          </p>
        </section>

        <div className="grid gap-5 pt-6 lg:grid-cols-2">
          <CommitmentCard
            icon={Shield}
            title="What we will not do with your data"
            lede="Four commitments, each one a mechanism rather than a promise."
            items={PRIVACY_COMMITMENTS}
            iconClass="border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200"
          />
          <CommitmentCard
            icon={FileText}
            title="What the agreement actually says"
            lede="The short version. The full documents are linked below and are worth reading."
            items={TERMS_SUMMARY}
            iconClass="border-white/10 bg-white/[0.05] text-stone-200"
          />
        </div>

        <section className="rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.05] to-transparent p-7 sm:p-8">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-sky-300/20 bg-sky-300/[0.08] text-sky-200">
            <KeyRound className="h-4 w-4" />
          </span>
          <h2 className="mt-4 font-display text-[1.5rem] font-semibold text-stone-50">The documents themselves</h2>
          <p className="mt-2 text-[14px] leading-7 text-stone-400">
            Nothing here is behind a sales conversation. Read any of it before you give us an
            email address.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {LEGAL_DOCS.map((doc) => (
              <Button
                key={doc.href}
                variant="ghost"
                className="border border-white/10 bg-white/[0.03] text-stone-200 hover:bg-white/[0.08] hover:text-white"
                asChild
              >
                <Link href={doc.href}>{doc.label}</Link>
              </Button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-7 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="font-display text-[1.4rem] font-semibold text-stone-50">
              Still want to ask a person?
            </h2>
            <p className="mt-1.5 text-[14px] text-stone-400">
              Questions about data handling go to a human, usually the same day.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2.5">
            <Button
              variant="ghost"
              className="border border-white/10 text-stone-200 hover:bg-white/[0.08] hover:text-white"
              asChild
            >
              <Link href="/contact">Write to us</Link>
            </Button>
            <Button
              className="bg-emerald-300 font-semibold text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.55)] hover:bg-emerald-200"
              asChild
            >
              <Link href="/signup">Try free for 30 days</Link>
            </Button>
          </div>
        </section>
      </div>
    </PublicSiteShell>
  )
}
