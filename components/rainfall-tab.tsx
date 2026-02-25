"use client"

import { useState, useEffect, type ChangeEvent, type KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toast } from "@/components/ui/use-toast"
import { CalendarIcon, CloudRain, Trash2, Download } from "lucide-react"
import { format } from "date-fns"
import { useAuth } from "@/hooks/use-auth"
import { formatDateOnly } from "@/lib/date-utils"
import { formatNumber } from "@/lib/format"
import { canAcceptNonNegative, isBlockedNumericKey } from "@/lib/number-input"

type RainfallRecord = {
  id: number
  record_date: string
  inches: number
  cents: number
  notes?: string
  user_id: string
}

type RainfallTabProps = {
  username: string
  showDataToolsControls?: boolean
}

export default function RainfallTab({ username, showDataToolsControls = false }: RainfallTabProps) {
  const { user } = useAuth()
  const canDelete = user?.role === "admin" || user?.role === "owner"
  const [records, setRecords] = useState<RainfallRecord[]>([])
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [inches, setInches] = useState("")
  const [cents, setCents] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const blockInvalidNumberKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isBlockedNumericKey(event.key)) {
      event.preventDefault()
    }
  }
  const handleNonNegativeChange = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value
    if (!canAcceptNonNegative(nextValue)) return
    setter(nextValue)
  }

  const fetchRecords = async () => {
    try {
      const response = await fetch("/api/rainfall")
      const data = await response.json()
      if (data.success) {
        setRecords(data.records || [])
      }
    } catch (error) {
      console.error("[v0] Error fetching rainfall records:", error)
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [])

  const handleSaveRecord = async () => {
    const inchesNum = inches === "" ? 0 : Number.parseInt(inches, 10)
    const centsNum = cents === "" ? 0 : Number.parseInt(cents, 10)

    if (!Number.isFinite(inchesNum) || inchesNum < 0) {
      toast({
        title: "Invalid data",
        description: "Inches must be 0 or more",
        variant: "destructive",
      })
      return
    }
    if (!Number.isFinite(centsNum) || centsNum < 0 || centsNum > 99) {
      toast({
        title: "Invalid data",
        description: "Hundredths must be between 0 and 99",
        variant: "destructive",
      })
      return
    }

    if (inchesNum === 0 && centsNum === 0) {
      toast({
        title: "Invalid data",
        description: "Please enter at least some rainfall amount",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/rainfall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_date: format(selectedDate, "yyyy-MM-dd"),
          inches: inchesNum,
          cents: centsNum,
          notes,
          user_id: username,
        }),
      })

      const data = await response.json()
      if (data.success) {
        toast({
          title: "Record saved",
          description: "Rainfall record has been saved successfully",
        })
        setInches("")
        setCents("")
        setNotes("")
        fetchRecords()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to save record",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save rainfall record",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteRecord = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return

    try {
      const response = await fetch(`/api/rainfall?id=${id}`, { method: "DELETE",  })
      const data = await response.json()
      if (data.success) {
        toast({ title: "Record deleted", description: "Rainfall record has been deleted" })
        fetchRecords()
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete record", variant: "destructive" })
    }
  }

  // Calculate monthly totals for dashboard
  const getMonthlyTotals = () => {
    const totals: { [key: string]: number } = {}
    let annualTotal = 0

    records.forEach((record) => {
      const date = new Date(record.record_date)
      const monthKey = format(date, "yyyy-MM")
      const rainfall = record.inches + record.cents / 100
      totals[monthKey] = (totals[monthKey] || 0) + rainfall
      annualTotal += rainfall
    })

    return { totals, annualTotal }
  }

  const exportToCSV = () => {
    const currentYear = new Date().getFullYear()
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    // Create a map of date -> rainfall amount
    const rainfallMap: { [key: string]: string } = {}
    records.forEach((record) => {
      const date = new Date(record.record_date)
      if (date.getFullYear() === currentYear) {
        const dateKey = format(date, "yyyy-MM-dd")
        rainfallMap[dateKey] = `${record.inches}.${String(record.cents).padStart(2, "0")}`
      }
    })

    const monthlyTotals: number[] = []
    for (let month = 0; month < 12; month++) {
      let monthTotal = 0
      for (let day = 1; day <= 31; day++) {
        const dateStr = `${currentYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        if (rainfallMap[dateStr]) {
          const [inches, cents] = rainfallMap[dateStr].split(".").map(Number)
          monthTotal += inches + cents / 100
        }
      }
      monthlyTotals.push(monthTotal)
    }

    // Calculate annual total (sum of all monthly totals)
    const annualTotal = monthlyTotals.reduce((sum, total) => sum + total, 0)

    // Build CSV with days as rows and months as columns
    const csvRows: string[] = []

    // Header row: Day, Jan, Feb, Mar, ...
    csvRows.push(["Day", ...months].join(","))

    // Data rows: 1-31
    for (let day = 1; day <= 31; day++) {
      const row = [String(day)]

      // For each month, check if this day has rainfall
      for (let month = 0; month < 12; month++) {
        const dateStr = `${currentYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        row.push(rainfallMap[dateStr] || "")
      }

      csvRows.push(row.join(","))
    }

    const totalsRow = ["TOTAL"]
    monthlyTotals.forEach((total) => {
      totalsRow.push(total.toFixed(2))
    })
    csvRows.push(totalsRow.join(","))

    const annualRow = ["ANNUAL TOTAL", "", "", "", "", "", "", "", "", "", "", "", annualTotal.toFixed(2)]
    csvRows.push(annualRow.join(","))

    // Download CSV
    const csvContent = csvRows.join("\n")
    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `rainfall-${currentYear}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)

    toast({
      title: "Export successful",
      description: `Rainfall data exported for ${currentYear}`,
    })
  }

  const { totals: monthlyTotals, annualTotal } = getMonthlyTotals()

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const currentYear = new Date().getFullYear()

  return (
    <div className="space-y-6">
      {/* Dashboard */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CloudRain className="h-5 w-5" />
                Rainfall Dashboard - {currentYear}
              </CardTitle>
              <CardDescription>Monthly rainfall totals in inches</CardDescription>
            </div>
            {showDataToolsControls && (
              <Button onClick={exportToCSV} variant="outline" className="gap-2 bg-transparent">
                <Download className="h-4 w-4" />
                Export to CSV
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-12 gap-2 mb-4">
            {months.map((month, idx) => {
              const monthKey = `${currentYear}-${String(idx + 1).padStart(2, "0")}`
              const total = monthlyTotals[monthKey] || 0
              return (
                <div key={month} className="text-center">
                  <div className="text-xs font-medium text-gray-600">{month}</div>
                  <div className="text-sm font-semibold">{formatNumber(total)}</div>
                </div>
              )
            })}
          </div>
          <div className="border-t pt-4">
            <div className="flex justify-between items-center">
              <span className="font-medium text-lg">Annual Total:</span>
              <span className="font-bold text-xl text-blue-600">{formatNumber(annualTotal)} inches</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Record Form */}
      <Card>
        <CardHeader>
          <CardTitle>Add Rainfall Record</CardTitle>
          <CardDescription>Record daily rainfall measurements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-medium">Date</div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal bg-transparent">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatDateOnly(selectedDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={selectedDate} onSelect={(date) => date && setSelectedDate(date)} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Notes (optional)</label>
              <Input
                placeholder="e.g., Heavy rain in afternoon"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel
                label="Inches"
                htmlFor="rainfall-inches"
                className="mb-2"
                labelClassName="text-sm font-medium"
                tooltip="Whole inches of rainfall for the day."
              />
              <Input
                id="rainfall-inches"
                type="number"
                placeholder="0"
                value={inches}
                onChange={handleNonNegativeChange(setInches)}
                onKeyDown={blockInvalidNumberKey}
                min={0}
                step="1"
              />
            </div>
            <div>
              <FieldLabel
                label="Hundredths (0-99)"
                htmlFor="rainfall-cents"
                className="mb-2"
                labelClassName="text-sm font-medium"
                tooltip="Decimal part of inches (e.g., 0.25 in = 25)."
              />
              <Input
                id="rainfall-cents"
                type="number"
                placeholder="0"
                value={cents}
                onChange={handleNonNegativeChange(setCents)}
                onKeyDown={blockInvalidNumberKey}
                min={0}
                max={99}
                step="1"
              />
            </div>
          </div>
          <Button onClick={handleSaveRecord} disabled={loading} className="w-full">
            {loading ? "Saving..." : "Save Record"}
          </Button>
        </CardContent>
      </Card>

      {/* Records List */}
      <Card>
        <CardHeader>
          <CardTitle>Rainfall Records</CardTitle>
          <CardDescription>All recorded rainfall measurements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {records.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No records yet</p>
            ) : (
              records.map((record) => (
                <div key={record.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{formatDateOnly(record.record_date)}</div>
                  <div className="text-sm text-gray-600">
                    {formatNumber(record.inches + record.cents / 100)} inches
                      {record.notes && <span className="ml-2 text-gray-500">• {record.notes}</span>}
                    </div>
                  </div>
                  {canDelete && (
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteRecord(record.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
