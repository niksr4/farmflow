import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requireSessionUser } from "@/lib/server/auth"
import { sql } from "@/lib/server/db"
import { redirect } from "next/navigation"

type TableRow = {
  table_name: string
  row_estimate: number
}

type TenantTable = {
  table_name: string
}

export default async function InspectDatabasesPage() {
  const sessionUser = await requireSessionUser()
  if (sessionUser.role !== "owner") {
    redirect("/dashboard")
  }

  if (!sql) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Database Inspection</CardTitle>
            <CardDescription>DATABASE_URL is not configured for this environment.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Set DATABASE_URL in your environment to inspect tables and row counts.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const tables = (await sql`
    SELECT relname as table_name, COALESCE(n_live_tup, 0)::bigint as row_estimate
    FROM pg_stat_user_tables
    ORDER BY relname ASC
  `) as TableRow[]

  const tenantTables = (await sql`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenant_id'
    ORDER BY table_name ASC
  `) as TenantTable[]

  const tenantScoped = new Set(tenantTables.map((row) => row.table_name))

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Database Inspection</CardTitle>
          <CardDescription>Approximate row counts and tenant scoping.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Showing {tables.length} tables. Tenant scoped tables: {tenantScoped.size}.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tables</CardTitle>
          <CardDescription>Row counts are approximate (from Postgres stats).</CardDescription>
        </CardHeader>
        <CardContent>
          {tables.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tables found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead className="text-right">Est. Rows</TableHead>
                    <TableHead>Tenant Scoped</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.map((table) => (
                    <TableRow key={table.table_name}>
                      <TableCell className="font-medium">{table.table_name}</TableCell>
                      <TableCell className="text-right">{Number(table.row_estimate || 0).toLocaleString()}</TableCell>
                      <TableCell>{tenantScoped.has(table.table_name) ? "Yes" : "No"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
