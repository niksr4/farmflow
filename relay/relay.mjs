/**
 * FarmFlow biometric ingest relay.
 *
 * BioMax N-WL20 terminals have no TLS stack — verified by probe on 2026-08-10: 13 connections,
 * 11 plain HTTP, zero TLS handshakes, even when pointed at a conventionally-TLS port. They speak
 * HTTP/1.0 in the clear. Vercel serves HTTPS only and 308-redirects plain HTTP, which these
 * devices do not follow. This bridges that gap and does nothing else.
 *
 * Deliberately dumb and stateless: no database, no tenant logic, no parsing of the body. The
 * device self-identifies with the dev_id header and FarmFlow resolves the estate from it, so the
 * relay never needs to know which estate anything belongs to.
 */
import http from "node:http"
import https from "node:https"

const PORT = Number(process.env.PORT || 8001)
const TARGET_HOST = process.env.TARGET_HOST || "www.thefarmflow.in"
const TARGET_PATH = process.env.TARGET_PATH || "/hdata.aspx"
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 20000)

const log = (...parts) => console.log(new Date().toISOString(), ...parts)

const server = http.createServer((req, res) => {
  const chunks = []
  req.on("data", (c) => chunks.push(c))

  req.on("end", () => {
    // Raw bytes, never a string. The enrolment push carries a binary fingerprint template after
    // the JSON; decoding it as UTF-8 replaces every non-UTF8 byte with U+FFFD and corrupts it.
    const body = Buffer.concat(chunks)
    const devId = req.headers.dev_id || "-"
    const requestCode = req.headers.request_code || "-"

    // Forward the device's protocol headers verbatim. Drop hop-by-hop headers and let the
    // upstream request set its own host/content-length, or Node will send contradictory ones.
    const forwarded = {}
    for (const [k, v] of Object.entries(req.headers)) {
      const key = k.toLowerCase()
      if (["host", "connection", "content-length", "transfer-encoding", "keep-alive"].includes(key)) continue
      forwarded[k] = v
    }
    forwarded["content-length"] = String(body.length)
    forwarded["x-forwarded-for"] = req.socket.remoteAddress?.replace("::ffff:", "") ?? ""

    const upstream = https.request(
      { host: TARGET_HOST, port: 443, path: TARGET_PATH, method: req.method || "POST", headers: forwarded, timeout: UPSTREAM_TIMEOUT_MS },
      (up) => {
        const outChunks = []
        up.on("data", (c) => outChunks.push(c))
        up.on("end", () => {
          const out = Buffer.concat(outChunks)
          // response_code: OK is the acknowledgement. If it does not reach the device verbatim,
          // the device treats the upload as failed and re-sends it forever. Copy every upstream
          // header rather than constructing a reply, so this cannot silently drift.
          const headers = { ...up.headers }
          delete headers["transfer-encoding"]
          delete headers["connection"]
          delete headers["content-length"]
          headers["content-length"] = String(out.length)

          // Vercel's edge rewrites underscores in header names to hyphens, so the app's
          // `response_code: OK` arrives here as `response-code: OK`. The device only recognises
          // the underscore form, so without restoring it the ack is invisible and the terminal
          // re-sends the same punch every ~2s forever. This does not reproduce against a local
          // Node server over HTTP/1.1, which passes the underscore through untouched -- it only
          // appears once the traffic goes through Vercel, which is why the relay is the right
          // place to repair it: it is the last hop that still knows it is talking to a device.
          const ack = up.headers["response_code"] ?? up.headers["response-code"]
          if (ack !== undefined) headers["response_code"] = ack

          res.writeHead(up.statusCode || 502, headers)
          res.end(out)
          log(`${devId} ${requestCode} -> ${up.statusCode} ack=${ack ?? "none"} ${body.length}B`)
        })
      },
    )

    upstream.on("timeout", () => {
      upstream.destroy(new Error("upstream timeout"))
    })
    upstream.on("error", (err) => {
      // No ack on failure, deliberately. The device buffers up to 150,000 records and retries
      // until acknowledged, so a relay or network outage is delay rather than data loss —
      // whereas a fake 200 with response_code: OK would make it discard punches for good.
      log(`${devId} ${requestCode} -> UPSTREAM ERROR: ${err.message}`)
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" })
      res.end()
    })

    upstream.end(body)
  })

  req.on("error", (err) => log(`request error: ${err.message}`))
})

// HTTP/1.0 clients send Connection: close and expect the server to hang up. Keep these short so
// a stalled device socket cannot accumulate.
server.keepAliveTimeout = 5000
server.headersTimeout = 10000

server.listen(PORT, "0.0.0.0", () => log(`relay listening on 0.0.0.0:${PORT} -> https://${TARGET_HOST}${TARGET_PATH}`))
