import "server-only"

export type BotUser = {
  tenantId: string
  userId: string
  role: string
  username: string
  phone: string
}

export type TenantBotContext = {
  tenantId: string
  tenantName: string
  cropFamily: string
  locations: Array<{ id: string; name: string }>
  inventoryItems: Array<{ itemType: string; unit: string; quantity: number }>
  activityCodes: Array<{ code: string; activity: string }>
  today: string
}

// A single parsed intent from a WhatsApp message
export type BotIntent =
  | {
      type: "record_expense"
      activityCode: string
      date: string
      amountInr: number
      notes: string
      inventoryItemType: string | null
      inventoryQuantity: number | null
      inventoryUnit: string | null
      locationId: string | null
    }
  | {
      type: "record_labor"
      date: string
      activityCode: string
      notes: string
      hfLaborers: number
      outsideLaborers: number
      costPerLaborer: number
      locationId: string | null
    }
  | {
      type: "record_processing"
      date: string
      coffeeType: string
      locationId: string | null
      cropToday: number
      ripeToday: number | null
      greenToday: number | null
      wetParchment: number | null
    }
  | {
      type: "record_picking"
      date: string
      locationId: string | null
      workerCount: number
      totalKg: number
      notes: string
    }
  | {
      type: "record_attendance"
      date: string
      presentCount: number
      absentCount: number
      notes: string
    }
  | {
      type: "query_inventory"
      itemFilter: string | null
    }
  | {
      type: "query_today"
    }
  | {
      type: "unknown"
      rawMessage: string
    }

export type PendingSession = {
  id: number
  phone: string
  tenantId: string
  userId: string
  userRole: string
  pendingIntent: BotIntent[]
}

export type BotExecutionResult = {
  success: boolean
  message: string
}
