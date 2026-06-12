import { recordDigestFeedback, type DigestFeedbackRating } from "@/lib/server/digest-feedback"

export const dynamic = "force-dynamic"

const PAGE_HTML = (title: string, message: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title} — FarmFlow</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:48px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr><td style="background:#052e16;border-radius:12px 12px 0 0;padding:24px 32px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#6ee7b7;">FarmFlow</p>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;padding:32px;text-align:center;">
          <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#111827;">${title}</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">${message}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const respond = (status: number, title: string, message: string) =>
  new Response(PAGE_HTML(title, message), { status, headers: { "content-type": "text/html; charset=utf-8" } })

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = String(searchParams.get("token") || "").trim()
  const rating = String(searchParams.get("rating") || "").trim()

  if (!token || (rating !== "up" && rating !== "down")) {
    return respond(400, "Invalid link", "This feedback link is missing required information.")
  }

  const recorded = await recordDigestFeedback(token, rating as DigestFeedbackRating)
  if (!recorded) {
    return respond(404, "Link expired", "This feedback link is from an older digest and is no longer active.")
  }

  return rating === "up"
    ? respond(200, "Thanks!", "Glad this week's digest was useful — see you next Monday.")
    : respond(200, "Thanks for the feedback", "We'll use this to make next week's digest more useful.")
}
