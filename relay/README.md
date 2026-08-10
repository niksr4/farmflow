# FarmFlow biometric ingest relay

A ~100-line plain-HTTP → HTTPS bridge that lets fingerprint terminals reach FarmFlow.

It is not part of the Next.js app and is not deployed by Vercel. It runs on its own small host.

## Why this exists

BioMax N-WL20 terminals (and the OEM family they belong to) **have no TLS stack**. Verified
against a live device on 2026-08-10 with a raw-TCP probe that classified the first byte of every
connection:

```
13 connections, 11 classified plain HTTP, 0 TLS handshakes
POST /hdata.aspx HTTP/1.0
```

They send cleartext regardless of the port they are pointed at — including conventionally-TLS
ports. Vercel serves HTTPS only and 308-redirects plain HTTP, which this firmware does not
follow. So the device cannot talk to `thefarmflow.in` directly, and no amount of configuration
on the device changes that.

The relay accepts what the device can actually send and forwards it over TLS.

Note the device's factory default was `www.bmxcloud.in:8001` — a plain-HTTP endpoint on the
public internet. Talking to a remote plain-HTTP host is the manufacturer's own supported
configuration, not a workaround.

## The three things it must get right

Each of these was learned the hard way; none is obvious from reading the code.

**1. `response_code: OK` must reach the device with an UNDERSCORE.**

Vercel's edge rewrites underscores in header names to hyphens, so the app's `response_code: OK`
arrives at the relay as `response-code: OK`. The device only recognises the underscored form.
Without restoring it, the device never sees its acknowledgement and re-sends the same punch every
~2 seconds indefinitely.

This does **not** reproduce against a local Node server over HTTP/1.1, which passes the underscore
through untouched. It only appears once traffic goes through Vercel — which is why the relay is
the right place to repair it: it is the last hop that still knows it is talking to a device.

**2. The body must be forwarded as raw bytes.**

The enrolment push carries a binary fingerprint template after the JSON. Reading it as a string
replaces every non-UTF8 byte with `U+FFFD` and corrupts it.

**3. Never fake an ack.**

On upstream failure the relay returns 502 without `response_code`. The device buffers up to
150,000 records and retries until acknowledged, so an outage is delay, not data loss. A fake
`200 + response_code: OK` would make it discard punches permanently.

## Protocol summary

```
POST /hdata.aspx
headers: dev_id (= serial), request_code, cmd_id, blk_no, blk_len
body:    [4-byte LE length][JSON][optional binary]

receive_cmd           idle poll, ~every 20s, carries fk_info device counters
realtime_enroll_data  a user was enrolled; JSON + fingerprint template
realtime_glog         A PUNCH: {user_id, io_time, io_mode, verify_mode}
```

`io_time` is naive local wall-clock (`YYYYMMDDHHMMSS`), not UTC. Full parsing lives in
`lib/hdata-protocol.ts`.

## Deploy

Currently on an Oracle Cloud Always Free VM (Ubuntu 22.04, `VM.Standard.E2.1.Micro`).

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo mkdir -p /opt/farmflow-relay
sudo cp relay.mjs /opt/farmflow-relay/relay.mjs
sudo cp farmflow-relay.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now farmflow-relay
```

**Open the port in BOTH firewalls.** Oracle has two and opening only one gives you a port that
hangs with no error:

```bash
# 1. Cloud: VCN -> Subnet -> Security List -> Add Ingress Rule, TCP 8001 from 0.0.0.0/0
# 2. Instance: Oracle's Ubuntu image ends INPUT with a blanket REJECT, so the rule must be
#    INSERTED BEFORE it -- `iptables -A` appends after the REJECT and never matches.
sudo iptables -I INPUT "$(sudo iptables -L INPUT -n --line-numbers | awk '/REJECT/{print $1; exit}')" \
  -m state --state NEW -p tcp --dport 8001 -j ACCEPT
sudo netfilter-persistent save
```

Verify — a **404 is success** for an unregistered serial (it proves the whole path works and that
FarmFlow correctly rejected an unknown device):

```bash
curl -s -D- -o /dev/null -X POST "http://<HOST>:8001/" -H "dev_id: TEST"
```

## Operational notes

- **Reserve the public IP.** Oracle assigns an ephemeral address by default; a stop/start changes
  it and every device silently stops delivering with no error anywhere.
- **Upgrade the Oracle account to Pay As You Go.** Always Free reclaims idle compute instances,
  and a relay handling a few punches a day is exactly that. PAYG keeps Always Free resources free
  but exempts them from reclamation.
- The device→relay hop is **unencrypted**, and the serial number is the only credential. For a
  worker number and a timestamp that is proportionate, but it means anyone on that path can forge
  punches for an estate. The device's `Net PWD` field is unexplored and may offer a second factor.

## Config

| Env | Default | |
|---|---|---|
| `PORT` | `8001` | Port the terminals connect to |
| `TARGET_HOST` | `www.thefarmflow.in` | |
| `TARGET_PATH` | `/hdata.aspx` | Fixed by device firmware |
| `UPSTREAM_TIMEOUT_MS` | `20000` | |

The app's device-setup panel reads `NEXT_PUBLIC_BIOMETRIC_RELAY_HOST` / `_PORT` to tell estates
which address to enter, so the relay can move without a code change.
