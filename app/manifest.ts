import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "FarmFlow",
    short_name: "FarmFlow",
    description: "Coffee estate operations with traceability, yields, and buyer-ready reporting.",
    start_url: "/dashboard?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    orientation: "portrait",
    background_color: "#f6fbf9",
    theme_color: "#12AEB1",
    categories: ["business", "productivity", "agriculture"],
    lang: "en",
    icons: [
      {
        src: "/pwa-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Open Dashboard",
        short_name: "Dashboard",
        description: "Launch FarmFlow dashboard",
        url: "/dashboard?tab=home&source=shortcut",
        icons: [{ src: "/icon-light-32x32.png", sizes: "32x32", type: "image/png" }],
      },
      {
        name: "Record Processing",
        short_name: "Processing",
        description: "Jump into processing entries",
        url: "/dashboard?tab=processing&source=shortcut",
        icons: [{ src: "/icon-light-32x32.png", sizes: "32x32", type: "image/png" }],
      },
      {
        name: "Record Dispatch",
        short_name: "Dispatch",
        description: "Jump into dispatch entries",
        url: "/dashboard?tab=dispatch&source=shortcut",
        icons: [{ src: "/icon-light-32x32.png", sizes: "32x32", type: "image/png" }],
      },
      {
        name: "Record Sales",
        short_name: "Sales",
        description: "Jump into sales entries",
        url: "/dashboard?tab=sales&source=shortcut",
        icons: [{ src: "/icon-light-32x32.png", sizes: "32x32", type: "image/png" }],
      },
    ],
  }
}
