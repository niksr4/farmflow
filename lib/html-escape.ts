/**
 * HTML escaping for values interpolated into outbound email bodies.
 *
 * Every transactional email in this codebase is built by string-interpolating values into an
 * HTML template. Anything that reaches those templates from a request — a contact form name,
 * a feedback message, a username, an `X-Forwarded-For` header — is attacker-controlled and
 * has to be escaped before it lands in the support inbox.
 *
 * ## Ampersand first, or the escaping is decorative
 *
 * The routes previously did `.replace(/</g, "&lt;").replace(/>/g, "&gt;")` without touching
 * `&`. That is not partial protection, it is *no* protection against a caller who knows about
 * it: the input `&lt;img src=x onerror=...&gt;` contains no angle brackets, passes through
 * untouched, and is decoded by the mail client back into a live tag. Escaping `&` first is
 * what makes the other replacements meaningful.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

/**
 * Escape for both element text and quoted attribute values. Quotes are included so a value
 * can safely sit inside `href="..."` — without them an input containing `"` closes the
 * attribute early and everything after it becomes markup.
 */
export const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)

const URL_SYNTAX_ESCAPES: Record<string, string> = {
  "?": "%3F",
  "&": "%26",
  "=": "%3D",
  "#": "%23",
  "%": "%25",
}

/**
 * Escape a value destined for a `mailto:`/`href` URL.
 *
 * Percent-encoding first stops the value being read as URL syntax (a `?` would start a
 * header block — `mailto:x@y?bcc=attacker@evil` — and `javascript:` style payloads rely on
 * the browser parsing the scheme), then HTML-escaping makes it safe inside the attribute.
 *
 * This used to run the value through `encodeURI` first. `encodeURI` deliberately leaves
 * URI-reserved characters — including `?`, `&`, `=`, `#` — untouched, on the assumption its
 * input is already a full, structurally-valid URI; that is backwards for this function, whose
 * input is one attacker-controlled *value* being embedded inside a URL. Those are exactly the
 * characters a header-injection payload (`?bcc=`, `&cc=`) depends on, so `encodeURI` provided
 * no protection against the attack this function's own docstring describes — confirmed
 * directly: `encodeURI("x@y?bcc=evil@x.com")` returns the string unchanged.
 *
 * Percent-encoding only `?&=#%` (rather than the blanket `encodeURIComponent`) keeps an
 * ordinary address like `nik@example.com` unchanged and human-readable, while still closing
 * the actual gap: none of those five characters are needed in a legitimate mailto address or
 * simple path/query-free URL, and every one of them is load-bearing in a URL-syntax attack.
 */
export const escapeHtmlAttributeUrl = (value: unknown): string =>
  escapeHtml(String(value ?? "").replace(/[?&=#%]/g, (char) => URL_SYNTAX_ESCAPES[char] ?? char))

/**
 * Strip CR/LF from a value used in an email subject. Newlines in a header are the classic
 * header-injection vector; Resend's JSON API encodes these for us, but a subject containing
 * raw newlines is malformed regardless and this keeps the guarantee local.
 */
export const sanitizeEmailHeaderValue = (value: unknown): string =>
  String(value ?? "").replace(/[\r\n]+/g, " ").trim()
