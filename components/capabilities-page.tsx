"use client"

/**
 * Public capabilities page.
 *
 * House rule: no em dashes in anything a visitor reads. The copy here is deliberately
 * concrete (outturn, the muster, weighbridge slip) rather than the abstraction nouns that
 * make software marketing interchangeable.
 */

import Link from "next/link"
import Image from "next/image"
import { Check, CloudRain, PackageCheck, Scale, Wallet } from "lucide-react"
import { PublicSiteShell } from "@/components/public-site-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const capabilitySections = [
  {
    title: "Labour, the store, and what a kilo really cost",
    description:
      "Mark the muster in the morning and issue fertiliser out of the store in the evening. By the end of the week the cost of a kilo of parchment has worked itself out, block by block.",
    icon: Wallet,
    image: "/images/estate-journey-harvest.jpg",
    alt: "A picker's hands full of ripe red coffee cherry above a collecting basin",
    bullets: [
      "Daily roll by activity code, for your own people and for contract gangs",
      "Fertiliser and spray come off store stock the moment they are issued",
      "Cost per kilo season to date, worked out per block and not as an estate average",
      "A warning in the Monday brief when a buyer quotes under what it cost you",
    ],
  },
  {
    title: "Cherry through the pulper and onto the yard",
    description:
      "Every batch from intake to dry weight, with Arabica and Robusta kept apart the whole way. Outturn is on screen the day you log it, not reconstructed in March.",
    icon: PackageCheck,
    image: "/images/estate-journey-processing.jpg",
    alt: "Ripe cherry moving down the washing channel beside the pulper",
    bullets: [
      "Cherry intake and pulping batches recorded against the block they came off",
      "Dry parchment and dry cherry counted separately, never pooled",
      "Batches that fall under your own season average get flagged",
      "Yard stock, processing days and locations visible without asking anyone",
    ],
  },
  {
    title: "Out of the gate, and what the buyer weighed",
    description:
      "Nothing counts as sold until the weighbridge slip comes back. If the sales figure runs past what was actually received, the app says so instead of quietly balancing.",
    icon: Scale,
    image: "/images/estate-journey-dispatch.jpg",
    alt: "A loaded lorry carrying estate produce through Karnataka traffic",
    bullets: [
      "Dispatch entries with bag count and the curing works it went to",
      "Stock releases for sale only against buyer-confirmed weight",
      "A flag the moment sales kg run past dispatch kg received",
      "Revenue per kilo sitting next to production cost per kilo",
    ],
  },
  {
    title: "Rain, weather, and the Monday brief",
    description:
      "Every Monday at six, a short read on the week that went: what moved, what looked wrong, where coffee is trading, and three things worth doing before Friday.",
    icon: CloudRain,
    image: "/images/estate-journey-curing.jpg",
    alt: "Parchment coffee spread out on hessian sacking to dry",
    bullets: [
      "Daily rain gauge readings and a three day forecast for drying decisions",
      "Wage share, cost per kilo and revenue trend, written out in plain sentences",
      "Benchmark coffee prices set against the parchment you have not sold",
      "Season against season once you have two of them on record",
    ],
  },
]

const starters = [
  {
    step: "Off season, April to September",
    title: "Starter",
    description:
      "Mark the daily labour and the fertiliser rounds. Keep the store straight. Log the rain. By October you have a clean cost baseline to judge the harvest against.",
    price: "₹1,299 a month",
  },
  {
    step: "Harvest, October to March",
    title: "Operations",
    description:
      "Adds pulping and drying records, dispatch, sales, the season P&L and the Monday brief. Cherry intake through to the bank payment, in one book.",
    price: "₹3,499 a month",
  },
  {
    step: "Whenever you like",
    title: "Move up without re-entering anything",
    description:
      "Every row you have already typed stays exactly where it is. Switching from Starter to Operations is a setting in the admin console, not a migration.",
    price: "No lock-in",
  },
]

export default function CapabilitiesPage() {
  return (
    <PublicSiteShell theme="dark">
      <div className="mx-auto w-full max-w-6xl space-y-16 sm:space-y-20">

        <section className="pt-4 text-center sm:pt-8">
          <Badge className="border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200">Capabilities</Badge>
          <h1 className="mx-auto mt-5 max-w-3xl text-balance font-display text-[2.4rem] font-semibold leading-[1.08] tracking-[-0.025em] text-stone-50 sm:text-5xl">
            What the estate does all year, written down as it happens
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-8 text-stone-400">
            Labour, the store, pulping, dispatch, sales and rain, all joined to one another. The
            point of joining them is that cost per kilo stops being a guess you make after the
            season closes.
          </p>
        </section>

        <section className="space-y-5">
          {capabilitySections.map((section, index) => {
            const Icon = section.icon
            const flip = index % 2 === 1
            return (
              <article
                key={section.title}
                className="group grid overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0a1411] transition-colors duration-300 hover:border-white/[0.16] lg:grid-cols-2"
              >
                <div className={`relative h-52 lg:h-auto lg:min-h-[19rem] ${flip ? "lg:order-2" : ""}`}>
                  <Image
                    src={section.image}
                    alt={section.alt}
                    fill
                    sizes="(min-width: 1024px) 560px, 100vw"
                    className="object-cover saturate-[0.92] transition-transform duration-[900ms] ease-out group-hover:scale-[1.03]"
                  />
                  {/* The scrim has to fade toward whichever edge meets the text panel, or the
                      photo ends in a hard vertical cut against the card. That edge is the LEFT
                      one when the image sits on the right, so the two cases are not symmetric. */}
                  <div
                    aria-hidden
                    className={`absolute inset-0 bg-gradient-to-t from-[#0a1411] via-[#0a1411]/25 to-transparent lg:bg-gradient-to-r ${
                      flip
                        ? "lg:from-[#0a1411] lg:via-[#0a1411]/30 lg:to-[#0a1411]/10"
                        : "lg:from-[#0a1411]/10 lg:via-[#0a1411]/30 lg:to-[#0a1411]"
                    }`}
                  />
                </div>

                <div className="p-7 sm:p-9">
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h2 className="mt-4 font-display text-[1.45rem] font-semibold leading-snug text-stone-50">
                    {section.title}
                  </h2>
                  <p className="mt-2.5 text-[14px] leading-7 text-stone-400">{section.description}</p>
                  <ul className="mt-5 space-y-2.5">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2.5 text-[13.5px] leading-6 text-stone-300">
                        <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            )
          })}
        </section>

        <section className="rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.05] to-transparent p-7 sm:p-9">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400/90">
            How estates usually begin
          </p>
          <h2 className="mt-3 font-display text-[1.8rem] font-semibold leading-snug text-stone-50">
            Start light in the off season. Go full when the picking starts.
          </h2>
          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            {starters.map((s) => (
              <div key={s.step} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">{s.step}</p>
                <p className="mt-2.5 font-display text-[17px] font-semibold text-stone-100">{s.title}</p>
                <p className="mt-2 text-[13px] leading-6 text-stone-400">{s.description}</p>
                <p className="mt-4 text-[12px] font-bold text-emerald-400">{s.price}</p>
              </div>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Button
              className="bg-emerald-300 font-semibold text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.55)] hover:bg-emerald-200"
              asChild
            >
              <Link href="/signup">Try free for 30 days</Link>
            </Button>
            <Button
              variant="ghost"
              className="border border-white/10 text-stone-200 hover:bg-white/[0.08] hover:text-white"
              asChild
            >
              <Link href="/plans">See what it costs</Link>
            </Button>
          </div>
        </section>
      </div>
    </PublicSiteShell>
  )
}
