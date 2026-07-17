// Pure decision logic for username/email login matching, split out of the NextAuth authorize()
// flow so it can be unit-tested without a database. Usernames are only unique per tenant
// (uq_users_tenant_username), and the credential lookup spans all tenants — so the same
// username+password can exist in more than one estate. When it does, a username login must be
// refused (we cannot know which estate the user meant); email logins are globally unique and
// therefore never ambiguous.
export function classifyCredentialMatches(
  matchedTenantIds: Array<string | null | undefined>,
  isEmailLogin: boolean,
): { ambiguous: boolean; distinctTenants: number } {
  const distinct = new Set(matchedTenantIds.map((id) => String(id ?? "")))
  distinct.delete("")
  return {
    ambiguous: !isEmailLogin && distinct.size > 1,
    distinctTenants: distinct.size,
  }
}
