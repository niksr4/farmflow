import "server-only"

// Written by the header estate selector (components/inventory-system/workspace-header.tsx via
// components/inventory-system.tsx's cookie-write effect). Kept as a server-only constant rather
// than importing components/inventory-system/constants.ts (a client-facing module) into server
// routes. Now shared by every estate-aware route -- update here, not per-route, if it's ever
// renamed.
export const SELECTED_ESTATE_COOKIE = "farmflow_selected_estate"
