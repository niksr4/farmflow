import { describe, expect, it } from "vitest"
import { buildPdfFromCsv, toWinAnsi } from "@/lib/report-pdf"

/**
 * THE RUPEE SIGN IS THE WHOLE REASON THIS GUARD EXISTS.
 *
 * `lib/format.ts`'s `formatCurrency` emits U+20B9 on 170 call sites, and a PDF text literal drawn
 * in Courier is read one byte at a time. The previous hand-rolled writer UTF-8-encoded the finished
 * file, so `Rs1,62,397` written with the sign went in as `e2 82 b9` and came out as two garbage
 * glyphs in front of the number. Verified against that writer before this one was written: the
 * content stream read `Picking \342\202\2711,62,397 paid`.
 *
 * Nothing about that throws. The button works, the file downloads, the total is unreadable -- the
 * exact failure shape CLAUDE.md's silent-failure section is about, aimed at the one figure a
 * financial report exists to carry.
 */

const decode = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1")

describe("the character folding a report PDF depends on", () => {
  it("turns the rupee sign into something Courier can actually draw", () => {
    expect(toWinAnsi("₹1,62,397")).toBe("Rs1,62,397")
  })

  it("makes an undrawable character visible rather than dropping it", () => {
    /**
     * A vanished character is the silent version of this bug: a name one glyph short still reads
     * as a name, so nobody checks it. `?` is obviously wrong to whoever holds the page.
     */
    const folded = toWinAnsi("ಕಾಫಿ")
    expect(folded).toBe("????")
    expect(folded).toHaveLength(4)
  })

  it("keeps accented Latin names, which WinAnsi can draw", () => {
    expect(toWinAnsi("José Ménon")).toBe("José Ménon")
  })

  it("folds the punctuation that arrives via pasted text", () => {
    expect(toWinAnsi("rate – 450")).toBe("rate - 450")
    expect(toWinAnsi("don’t")).toBe("don't")
  })
})

describe("buildPdfFromCsv", () => {
  const csv = ["Date,Worker,Activity,Paid", "2026-10-13,Saina,Picking,₹988.00", "2026-10-14,Mumtaz,Weeding,₹1,240.50"].join(
    "\n",
  )

  it("renders money without the garbage glyphs the old writer produced", () => {
    const text = decode(buildPdfFromCsv(csv, { title: "HoneyFarm Estate -- Labour" }))

    expect(text).toContain("Rs988.00")
    // The signature of the bug, in both the raw-byte and octal-escape forms it could take.
    expect(text).not.toContain("â¹")
    expect(text).not.toContain("\\342\\202\\271")
  })

  it("declares WinAnsi on every font it uses", () => {
    /**
     * Without an /Encoding, Courier falls back to StandardEncoding, where the bytes above 127 map
     * to a different glyph set entirely -- so the octal escape that should draw an accented letter
     * draws a symbol instead. The escaping and the encoding only work as a pair.
     */
    const text = decode(buildPdfFromCsv(csv, { title: "Fonts" }))
    const fonts = [...text.matchAll(/\/Type \/Font[^>]*>>/g)].map((match) => match[0])
    expect(fonts.length).toBeGreaterThanOrEqual(2)
    for (const font of fonts) expect(font).toContain("/WinAnsiEncoding")
  })

  it("emits a pure-ASCII file, which is what makes the byte offsets below exact", () => {
    const bytes = buildPdfFromCsv("Name,Note\nJosé,rate – 450", { title: "Accented" })
    const highBytes = [...bytes].filter((byte) => byte > 0x7e)
    expect(highBytes).toEqual([])
    // ...and the accented character survived as an octal escape rather than being lost.
    expect(decode(bytes)).toContain("Jos\\351")
  })

  /**
   * ⚠ THE ASSERTION THAT ACTUALLY PROVES THE FILE IS WELL-FORMED.
   *
   * "It starts with %PDF and ends with %%EOF" passes on a file no reader can open, and most
   * viewers silently rebuild a broken xref table, so opening it by hand proves nothing either.
   * The real invariant is that every offset in the xref points at that object's own header.
   */
  it("writes an xref table whose offsets land on their objects", () => {
    const text = decode(buildPdfFromCsv(csv, { title: "Offsets", subtitle: "two rows" }))

    const startxref = Number(text.slice(text.lastIndexOf("startxref") + 9).trim().split(/\s/)[0])
    expect(text.slice(startxref, startxref + 4)).toBe("xref")

    const header = text.slice(startxref).match(/^xref\n0 (\d+)\n/)
    expect(header).not.toBeNull()
    const objectCount = Number(header![1])
    expect(objectCount).toBeGreaterThan(4)

    // ⚠ `.slice(1, …)` -- the FIRST line is the free-object entry `0000000000 65535 f`, not
    // object 1. Reading it as object 1 made this assert that offset 0 holds "1 0 obj", which fails
    // over a correct file and would have been "fixed" by loosening the assertion.
    const entries = text
      .slice(startxref + header![0].length)
      .split("\n")
      .slice(1, objectCount)
    expect(entries).toHaveLength(objectCount - 1)

    entries.forEach((entry, index) => {
      const objectNumber = index + 1
      const offset = Number(entry.slice(0, 10))
      expect(text.slice(offset, offset + `${objectNumber} 0 obj`.length), `xref entry ${objectNumber}`).toBe(
        `${objectNumber} 0 obj`,
      )
    })
  })

  it("repeats the column headings on every page", () => {
    const rows = Array.from({ length: 180 }, (_, index) => `2026-10-01,Worker ${index},Picking,100`)
    const text = decode(buildPdfFromCsv(["Date,Worker,Activity,Paid", ...rows].join("\n"), { title: "Long" }))

    // More than one page, and the heading is drawn once per page.
    const pageCount = Number(text.match(/\/Count (\d+)/)![1])
    expect(pageCount).toBeGreaterThan(1)
    const headingDraws = [...text.matchAll(/\(Date\s+Worker/g)].length
    expect(headingDraws).toBe(pageCount)
    expect(text).toContain(`Page 1 of ${pageCount}`)
  })

  it("shares the CSV parser, so a quoted comma is one cell in the PDF too", () => {
    const text = decode(
      buildPdfFromCsv('Worker,Note\nSaina,"Picking, block 4"', { title: "Quoting" }),
    )
    expect(text).toContain("Picking, block 4")
  })

  it("marks a truncated cell as truncated instead of quietly shortening it", () => {
    const wide = `Note\n${"x".repeat(400)}`
    const text = decode(buildPdfFromCsv(wide, { title: "Wide", orientation: "portrait" }))
    expect(text).toMatch(/x+\.\./)
  })

  it("turns the page sideways on its own when the table will not fit upright", () => {
    const narrow = decode(buildPdfFromCsv("A,B\n1,2", { title: "Narrow" }))
    expect(narrow).toContain("/MediaBox [0 0 612 792]")

    const columns = Array.from({ length: 18 }, (_, index) => `column_heading_${index}`)
    const wide = decode(
      buildPdfFromCsv([columns.join(","), columns.map(() => "123456").join(",")].join("\n"), { title: "Wide" }),
    )
    expect(wide).toContain("/MediaBox [0 0 792 612]")
  })

  it("says so rather than handing back a blank page when the period is empty", () => {
    const text = decode(buildPdfFromCsv("Date,Paid", { title: "Empty", subtitle: "1 Oct to 7 Oct" }))
    expect(text).toContain("No rows for this period.")
    expect(text).toContain("1 Oct to 7 Oct")
  })

  it("does not break on an empty string", () => {
    expect(() => buildPdfFromCsv("", { title: "Nothing" })).not.toThrow()
  })

  it("closes a parenthesis in the data instead of corrupting the page", () => {
    // An unescaped ")" ends the PDF string early and every byte after it becomes page operators.
    const text = decode(buildPdfFromCsv("Note\nAdvance (recovered) 500", { title: "Parens" }))
    expect(text).toContain("Advance \\(recovered\\) 500")
  })
})
