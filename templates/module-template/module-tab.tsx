"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { istDateIso } from "@/lib/date-utils"

export default function ModuleTabTemplate() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [records, setRecords] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [metricA, setMetricA] = useState("")
  const [metricB, setMetricB] = useState("")

  const loadRecords = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/__MODULE_ID__")
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load records")
      }
      setRecords(data.records || [])
    } catch (error) {
      console.error("Failed to load records", error)
      toast({ title: "Error", description: "Failed to load records", variant: "destructive" })
      setRecords([])
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (!user?.tenantId) return
    void loadRecords()
  }, [user?.tenantId, loadRecords])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await fetch("/api/__MODULE_ID__", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The estate day (IST), not the UTC date: before 05:30 IST the UTC date is still yesterday.
          record_date: istDateIso(new Date()),
          metric_a: metricA,
          metric_b: metricB,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save record")
      }
      setMetricA("")
      setMetricB("")
      toast({ title: "Saved", description: "Record saved." })
      await loadRecords()
    } catch (error: any) {
      console.error("Failed to save record", error)
      toast({ title: "Error", description: error.message || "Failed to save record", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Module Title</CardTitle>
        <CardDescription>Describe the purpose and what operators should do here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label htmlFor="metric-a">Metric A</Label>
            <Input id="metric-a" placeholder="0" value={metricA} onChange={(e) => setMetricA(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="metric-b">Metric B</Label>
            <Input id="metric-b" placeholder="0" value={metricB} onChange={(e) => setMetricB(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Metric A</TableHead>
                <TableHead>Metric B</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Loading records...
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No records yet.
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{record.record_date}</TableCell>
                    <TableCell>{record.metric_a}</TableCell>
                    <TableCell>{record.metric_b}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
