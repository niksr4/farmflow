/**
 * Spreadsheet formula neutralisation for CSV cells.
 *
 * Free text from the app (buyer names, notes, lot ids, worker names) ends up in files opened in
 * Excel. A cell that starts with = + - @ (or a tab/CR) is executed as a formula there, so a note
 * typed as =HYPERLINK(...) would run on whoever opens the export. Such text gets a leading
 * apostrophe, the standard neutralisation. Plain numbers -- including negatives like "-12.50" --
 * and a lone "-" or "+" placeholder are left alone, because they are not formulas.
 *
 * Pure and dependency-free so server exports and client-side downloads share one definition.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/
const LONE_SIGN = /^[+-]$/

export const neutraliseFormula = (text: string): string =>
  FORMULA_LEAD.test(text) && !PLAIN_NUMBER.test(text) && !LONE_SIGN.test(text) ? `'${text}` : text
