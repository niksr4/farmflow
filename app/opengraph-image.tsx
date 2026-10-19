import { ImageResponse } from "next/og"

/**
 * The image WhatsApp, X and LinkedIn show when somebody shares a FarmFlow link.
 *
 * ⚠ THERE WAS NO OG IMAGE AT ALL, and the metadata declared
 * `twitter: { card: "summary_large_image" }` -- which asks for a big image card and then supplies
 * no image, so the card rendered broken rather than small. An estate owner forwarding the link to
 * another planter on WhatsApp is the single most likely way this product spreads in Kodagu, and it
 * was sharing as a bare grey rectangle.
 *
 * Generated rather than a static PNG so the wording lives next to the rest of the copy and cannot
 * drift from it. Next serves this at /opengraph-image and wires the meta tags automatically, for
 * every route that does not override it.
 */
export const alt = "FarmFlow: coffee estate management software"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0c1a14",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              fontSize: 30,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: "#6ee7b7",
              display: "flex",
            }}
          >
            FarmFlow
          </div>
          <div
            style={{
              fontSize: 76,
              lineHeight: 1.08,
              color: "#f8fafc",
              fontWeight: 700,
              maxWidth: 940,
              display: "flex",
            }}
          >
            Cherry to parchment to sale. One book.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 34, color: "#cbd5e1", maxWidth: 1000, display: "flex" }}>
            The muster, outturn, the store, and cost per kilo. For Arabica and Robusta estates.
          </div>
          <div style={{ fontSize: 28, color: "#6ee7b7", display: "flex" }}>thefarmflow.in</div>
        </div>
      </div>
    ),
    size,
  )
}
