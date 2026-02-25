import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { requireSessionUser } from "@/lib/server/auth"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import Link from "next/link"
import { redirect } from "next/navigation"

type InterestRow = {
  id: string
  created_at: string
  source: string | null
  ip_address: string | null
  metadata: Record<string, any> | null
}

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

const parseMetadata = (value: unknown) => {
  if (!value) return null
  if (typeof value === "object") return value as Record<string, any>
  if (typeof value !== "string") return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default async function RegisterInterestAdminPage() {
  const sessionUser = await requireSessionUser()
  if (sessionUser.role !== "owner") {
    redirect("/dashboard")
  }

  if (!sql) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Request Access Submissions</CardTitle>
            <CardDescription>DATABASE_URL is not configured for this environment.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Configure the database connection to view submissions.
          </CardContent>
        </Card>
      </div>
    )
  }

  const tenantContext = normalizeTenantContext(undefined, "owner")
  let rows: InterestRow[] = []
  let tableMissing = false
  try {
    rows = (await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id, created_at, source, ip_address, metadata
        FROM security_events
        WHERE event_type = 'landing_register_interest'
        ORDER BY created_at DESC
        LIMIT 500
      `,
    )) as InterestRow[]
  } catch (error) {
    if (isMissingRelation(error, "security_events")) {
      tableMissing = true
    } else {
      throw error
    }
  }

  const records = (rows || []).map((row) => {
    const metadata = parseMetadata(row.metadata)
    return {
      id: String(row.id),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      source: row.source ? String(row.source) : "unknown",
      ipAddress: row.ip_address ? String(row.ip_address) : null,
      name: metadata?.name ? String(metadata.name) : "",
      email: metadata?.email ? String(metadata.email) : "",
      organization: metadata?.organization ? String(metadata.organization) : metadata?.estate ? String(metadata.estate) : "",
      estateSize: metadata?.estateSize ? String(metadata.estateSize) : "",
      region: metadata?.region ? String(metadata.region) : "",
      notes: metadata?.notes ? String(metadata.notes) : "",
    }
  })

  const sourceCounts = records.reduce<Record<string, number>>((acc, record) => {
    const key = record.source || "unknown"
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Request Access Submissions</CardTitle>
          <CardDescription>
            Latest signup and landing interest submissions captured via <code>landing_register_interest</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/tenants">Back to Owner Console</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/api/admin/register-interest?limit=200">Open JSON Feed</Link>
          </Button>
          <span className="text-muted-foreground">Total submissions: {records.length}</span>
          {Object.entries(sourceCounts).map(([source, count]) => (
            <span key={source} className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
              {source}: {count}
            </span>
          ))}
        </CardContent>
      </Card>

      {tableMissing ? (
        <Card>
          <CardHeader>
            <CardTitle>Security Events Table Missing</CardTitle>
            <CardDescription>
              Run <code>scripts/41-security-events.sql</code> to enable submission logging.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Submission Log</CardTitle>
            <CardDescription>Most recent first.</CardDescription>
          </CardHeader>
          <CardContent>
            {records.length === 0 ? (
              <p className="text-sm text-muted-foreground">No submissions captured yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Estate</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {record.createdAt ? new Date(record.createdAt).toLocaleString() : "-"}
                        </TableCell>
                        <TableCell>{record.name || "-"}</TableCell>
                        <TableCell>{record.email || "-"}</TableCell>
                        <TableCell>{record.organization || "-"}</TableCell>
                        <TableCell>{record.region || record.estateSize || "-"}</TableCell>
                        <TableCell>{record.source || "-"}</TableCell>
                        <TableCell className="max-w-[340px] whitespace-pre-wrap break-words text-xs text-muted-foreground">
                          {record.notes || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
