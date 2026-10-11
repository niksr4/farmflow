import localFont from "next/font/local"

/**
 * THE FONTS, SELF-HOSTED. One declaration, two call sites.
 *
 * WHY. `next/font/google` downloads the woff2 from Google AT BUILD TIME, so every build depends on
 * fonts.gstatic.com being reachable from the builder. On 2026-09-29 it was not, for about four
 * minutes, and CI failed PR #53 with:
 *
 *     next/font/google queries have exactly one entry
 *     Error: Timed out waiting 180000ms from config.webServer
 *
 * which names neither the network nor the font, points at the E2E web server, and looks exactly
 * like a real regression. PR #54 built fine four minutes later on the same runner. Nothing in that
 * failure was about the code, and nothing in the message said so.
 *
 * The files are now committed, so a build needs no third party at all. It is also faster: two fewer
 * network round trips per cold build.
 *
 * WHY ONE MODULE RATHER THAN TWO DECLARATIONS. app/layout.tsx and components/public-site-shell.tsx
 * each declared both faces independently, with different weights -- the shell asked Fraunces for
 * 600/700/800 and Manrope for 400-700, the layout asked Fraunces for 600/700/800 and Manrope for
 * everything. Two sources of truth for the same typeface is how the marketing site and the app come
 * to render in subtly different weights, and nothing would have failed.
 *
 * THE FILES ARE THE LATIN VARIABLE SUBSETS, which is what next/font/google was already fetching for
 * `subsets: ["latin"]`. A variable face covers its whole weight range in one request, so this is not
 * a downgrade from the per-weight static instances -- it is the same bytes Google was serving.
 *
 *   Manrope   24 KB   weight 200-800
 *   Fraunces  67 KB   weight 600-800 (the range both call sites asked for)
 *
 * LICENSING. Both are SIL Open Font License 1.1, which permits bundling and redistribution and
 * REQUIRES the licence travel with the font. manrope-OFL.txt and fraunces-OFL.txt sit beside the
 * woff2 files for that reason -- deleting them would make shipping the fonts a licence breach, not
 * merely untidy.
 *
 * TO UPDATE a face: fetch the CSS for the family from fonts.googleapis.com with a modern browser
 * UA (it serves woff2 only to UAs it believes support it), take the URL from the `/* latin *\/`
 * block, and replace the file. The weight range in the CSS must match the declaration below.
 */

export const bodyFont = localFont({
  src: "./manrope-latin-variable.woff2",
  // The range the variable file actually carries. Declaring a narrower range would make the browser
  // synthesise weights it already has, which looks slightly wrong and is slower.
  weight: "200 800",
  style: "normal",
  display: "swap",
  variable: "--font-body",
  // Matches Manrope's own metrics, so the swap from the fallback does not shift the layout.
  // Without this, `display: "swap"` reflows every heading the moment the font lands.
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "sans-serif"],
})

export const displayFont = localFont({
  src: "./fraunces-latin-variable.woff2",
  weight: "600 800",
  style: "normal",
  display: "swap",
  variable: "--font-display",
  adjustFontFallback: "Times New Roman",
  fallback: ["Georgia", "Cambria", "Times New Roman", "serif"],
})
