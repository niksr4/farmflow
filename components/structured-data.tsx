import { CANONICAL_SITE_URL } from "@/lib/site-url"

/**
 * JSON-LD for the landing page: who we are, and what the product is.
 *
 * ⚠ THERE WAS NO STRUCTURED DATA ANYWHERE. Without it Google has only prose to work from, so the
 * result is a plain blue link: no product name, no price, no application category. For a term as
 * specific as "coffee estate management software" the competition is thin, and being the result
 * that carries a machine-readable description of exactly that is most of the advantage available.
 *
 * Two types, deliberately:
 *  - Organization, so the company resolves as an entity rather than a page.
 *  - SoftwareApplication, which is what FarmFlow actually is, with the trial expressed as an Offer.
 *
 * NO aggregateRating AND NO review. Five estates use this and none has left a public review;
 * inventing one is both a lie and a Google structured-data violation that earns a manual action.
 * This claims only what is true.
 */
export default function StructuredData() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${CANONICAL_SITE_URL}/#organization`,
        name: "FarmFlow",
        url: CANONICAL_SITE_URL,
        logo: `${CANONICAL_SITE_URL}/brand-logo.svg`,
        email: "support@thefarmflow.in",
        description:
          "Coffee estate management software for Arabica and Robusta planters in India.",
        areaServed: { "@type": "Country", name: "India" },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: "support@thefarmflow.in",
          availableLanguage: ["English", "Kannada"],
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${CANONICAL_SITE_URL}/#software`,
        name: "FarmFlow",
        url: CANONICAL_SITE_URL,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Agriculture management software",
        operatingSystem: "Web browser, Android, iOS",
        publisher: { "@id": `${CANONICAL_SITE_URL}/#organization` },
        description:
          "Track cherry intake, pulping, outturn, the daily muster roll, worker payroll, the fertiliser store and cost per kilo of parchment by block.",
        featureList: [
          "Daily muster roll and worker attendance",
          "Worker payroll with retention and advances",
          "Cherry intake, pulping and outturn records",
          "Fertiliser and input store with stock valuation",
          "Cost per kilo and cost per block",
          "Rainfall log and weather forecast",
          "Dispatch to curing works and sales records",
        ],
        offers: {
          "@type": "Offer",
          priceCurrency: "INR",
          description: "Free for the first 30 days, then an annual subscription per estate.",
          url: `${CANONICAL_SITE_URL}/plans`,
        },
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      // The payload is a literal built above with no user input in it, so there is nothing here
      // for anybody to inject. JSON.stringify also escapes the closing-tag sequence.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
