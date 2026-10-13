/**
 * Moving the domains, and proving they moved.
 *
 * ⚠ THIS IS SHARED BECAUSE THE TWO CALLERS DIVERGED ON IT. rollback.mjs re-read both aliases from
 * Vercel after writing them; go-live.mjs did not, so go-live could print "ROLLED BACK" when the
 * revert had not taken. Two copies of a safety check is one copy of a safety check.
 *
 * ⚠ BOTH DOMAINS, ALWAYS, AND PARTIAL FAILURE IS AN OUTAGE OF ITS OWN. www.thefarmflow.in and the
 * apex both alias to the deployment. If the first POST succeeds and the second throws, half the
 * traffic is on each build -- a state neither "deployed" nor "rolled back", and worse than either.
 * So setAliases reports which domains it managed to move, and the caller decides; it does not
 * throw on the first failure and leave the caller blind to what already changed.
 */

export const DOMAINS = ["www.thefarmflow.in", "thefarmflow.in"]

/**
 * Point every domain at `uid`. Never throws.
 *
 * Returns { moved, failed } so a partially-applied change is visible. `failed` being empty is the
 * only success; a non-empty `failed` with a non-empty `moved` is the split-brain case and the
 * caller must act on it rather than exit.
 */
export const setAliases = async (api, uid, domains = DOMAINS) => {
  const moved = []
  const failed = []
  for (const domain of domains) {
    try {
      await api(`/v2/deployments/${uid}/aliases`, { method: "POST", body: JSON.stringify({ alias: domain }) })
      moved.push(domain)
    } catch (e) {
      failed.push({ domain, error: String(e.message || e).slice(0, 200) })
    }
  }
  return { moved, failed }
}

/**
 * Ask Vercel what each domain actually serves now.
 *
 * A 200 on the alias POST means the request was accepted. This is what is being served, which is
 * the only thing worth reporting to somebody deciding whether an outage is over.
 */
export const verifyAliases = async (api, uid, domains = DOMAINS) => {
  const wrong = []
  for (const domain of domains) {
    try {
      const now = await api(`/v4/aliases/${domain}`)
      if (now.deploymentId !== uid) wrong.push({ domain, actual: now.deploymentId })
    } catch (e) {
      wrong.push({ domain, actual: `could not read: ${String(e.message || e).slice(0, 120)}` })
    }
  }
  return wrong
}
