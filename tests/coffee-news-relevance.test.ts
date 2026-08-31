import { describe, expect, it } from "vitest"

import { isRelevantArticle } from "../app/api/coffee-news/route"

/**
 * The news tab shows commodity news, not everything containing the word "coffee".
 *
 * Every headline below is real — captured from live TheNewsAPI responses on 2026-08-31 while
 * fixing the feed. That matters: a filter tuned against headlines I invented would be tuned
 * against my idea of the noise rather than the noise the API actually returns.
 *
 * BACKGROUND. The feed returned nothing at all from 2026-08-17 to 2026-08-31. The queries were
 * keyword chains — "coffee arabica robusta India price market Karnataka" — and TheNewsAPI joins
 * bare terms with AND, so an article had to contain all seven words. None ever did. Loosening to
 * OR then matched 18,510 articles and, since the plan returns three sorted by date, surfaced an
 * AeroPress listing and vegan tofu recipes. The queries are now narrow and business-scoped, and
 * this gate catches what still slips through.
 */
describe("what belongs in an estate's news feed", () => {
  it("keeps real commodity market news", () => {
    for (const [title, description] of [
      ["Global coffee prices surge on factors such as weather issues in Brazil", ""],
      ["India's arabica coffee crop may be hit by deficit rain, pest attack", ""],
      ["India's coffee output for 2026-27 seen up at 4.04 lakh tonnes", ""],
      ["World's top robusta supplier faces its strongest El Niño in 70 years", ""],
      ["Nestle could lower coffee prices as bean costs fall", ""],
    ]) {
      expect(isRelevantArticle(title, description), title).toBe(true)
    }
  })

  it("drops articles that merely contain the word", () => {
    // All four were actually returned by the live queries.
    for (const [title, description] of [
      ["Pepper Awards celebrates 20th milestone edition; opens entries", ""],
      ["'Saans lene ke bhi paise lagte hai': NRI woman sparks debate", ""],
      ["Meta's Double Standards, Weekly Funding Rundown & More", ""],
      ["AeroPress Go Travel Coffee Press w/ Mug", ""],
    ]) {
      expect(isRelevantArticle(title, description), title).toBe(false)
    }
  })

  it("needs both halves, not either", () => {
    // "coffee" alone is a beverage; "prices" alone is the entire news cycle.
    expect(isRelevantArticle("The best coffee shops in Bengaluru", "")).toBe(false)
    expect(isRelevantArticle("Petrol prices rise again", "")).toBe(false)
    expect(isRelevantArticle("Coffee prices rise again", "")).toBe(true)
  })

  it("reads the description too, not just the headline", () => {
    // Wire headlines are often bare; the market context sits in the standfirst.
    expect(isRelevantArticle("Karnataka growers under pressure", "Arabica output is down after deficit rain")).toBe(true)
  })

  it("matches whole words, so Peppercorn Media is not pepper news", () => {
    expect(isRelevantArticle("Peppercorns Media wins market share", "")).toBe(false)
  })
})
