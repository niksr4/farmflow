"use client"

// Re-exports the single toast store from components/ui/use-toast.ts. This file used to be a
// byte-for-byte copy with its own module-level `memoryState`/`listeners`, which meant every
// caller importing from "@/hooks/use-toast" (18 files, including sales-tab, dispatch-tab,
// admin-page, and other high-traffic screens) was dispatching into a store that <Toaster/>
// (app/layout.tsx, which only subscribes to "@/components/ui/use-toast") never listened to —
// every toast() call from those files silently did nothing. Re-exporting instead of duplicating
// guarantees there is exactly one store, so any caller of either import path is heard by the
// one mounted <Toaster/>.
export { useToast, toast, reducer } from "@/components/ui/use-toast"
