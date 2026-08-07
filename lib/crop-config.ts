/**
 * Labels that map the fixed processing_records columns to crop-specific display text.
 * Crops with genuinely different stage chains (e.g. tea with withering→rolling→firing)
 * use this as a best-effort bridge until a generic processing table is built (Q2).
 */
export type CropProcessingTerms = {
  intake: string           // crop_today — what comes in at the gate
  primarySort: string      // ripe_today — first-grade / primary sort output
  secondarySort: string    // green_today — second-grade / rejects
  wetProcess: string       // wet_parchment — intermediate wet/processed form
  primaryOutput: string    // dry_p_bags — main saleable output (bags)
  secondaryOutput: string  // dry_cherry_bags — secondary saleable output (bags), or empty
}

export type CropFamily = {
  id: string
  label: string
  varieties: string[]
  notes?: string
  processingTerms: CropProcessingTerms
}

// Coffee remains the default product, but this list helps you expand later.
export const CROP_FAMILIES: CropFamily[] = [
  {
    id: "coffee",
    label: "Coffee",
    varieties: ["Arabica", "Robusta"],
    notes: "Primary coffee varieties typically tracked by estates.",
    processingTerms: {
      intake: "Cherry intake (kg)",
      primarySort: "Ripe cherry (kg)",
      secondarySort: "Green / float cherry (kg)",
      wetProcess: "Wet parchment (kg)",
      primaryOutput: "Dry parchment (bags)",
      secondaryOutput: "Dry cherry (bags)",
    },
  },
  {
    id: "tea",
    label: "Tea",
    varieties: ["Assam", "Darjeeling", "Nilgiri", "Ceylon", "Kenya", "Yunnan"],
    notes: "Full tea workflow (withering → rolling → firing → grading) requires a dedicated module (roadmap Q2). These fields cover the intake and made-tea output in the interim.",
    processingTerms: {
      intake: "Green leaf intake (kg)",
      primarySort: "Withered leaf (kg)",
      secondarySort: "Rejected leaf (kg)",
      wetProcess: "Rolled / CTC leaf (kg)",
      primaryOutput: "Made tea — Orthodox (bags)",
      secondaryOutput: "Made tea — CTC / Dust (bags)",
    },
  },
  {
    id: "cocoa",
    label: "Cocoa",
    varieties: ["Forastero", "Criollo", "Trinitario"],
    processingTerms: {
      intake: "Fresh pods / wet beans (kg)",
      primarySort: "Fermented beans (kg)",
      secondarySort: "Unfermented / rejected (kg)",
      wetProcess: "Semi-dried beans (kg)",
      primaryOutput: "Dried beans (bags)",
      secondaryOutput: "",
    },
  },
  {
    id: "spices",
    label: "Spices",
    varieties: ["Pepper", "Cardamom", "Clove", "Cinnamon", "Vanilla", "Nutmeg"],
    processingTerms: {
      intake: "Harvested (kg)",
      primarySort: "Grade A / ripe (kg)",
      secondarySort: "Unripe / rejected (kg)",
      wetProcess: "Partially dried (kg)",
      primaryOutput: "Dried spice (bags)",
      secondaryOutput: "",
    },
  },
  {
    id: "tree_nuts",
    label: "Tree Nuts",
    varieties: ["Cashew", "Macadamia", "Hazelnut", "Almond"],
    processingTerms: {
      intake: "Fresh harvest (kg)",
      primarySort: "Shelled / peeled (kg)",
      secondarySort: "Rejected / waste (kg)",
      wetProcess: "Processed (kg)",
      primaryOutput: "Finished nuts (bags)",
      secondaryOutput: "",
    },
  },
  {
    id: "grains",
    label: "Grains",
    varieties: ["Rice", "Maize", "Wheat", "Millet", "Sorghum"],
    processingTerms: {
      intake: "Harvested grain (kg)",
      primarySort: "Cleaned grain (kg)",
      secondarySort: "Chaff / waste (kg)",
      wetProcess: "Milled (kg)",
      primaryOutput: "Milled output (bags)",
      secondaryOutput: "",
    },
  },
  {
    id: "horticulture",
    label: "Horticulture",
    varieties: ["Banana", "Pineapple", "Avocado", "Mango", "Citrus"],
    processingTerms: {
      intake: "Harvested (kg)",
      primarySort: "Grade A / ripe (kg)",
      secondarySort: "Rejects (kg)",
      wetProcess: "Processed / packed (kg)",
      primaryOutput: "Primary output (bags / crates)",
      secondaryOutput: "",
    },
  },
]

export const DEFAULT_COFFEE_VARIETIES = CROP_FAMILIES.find((crop) => crop.id === "coffee")?.varieties ?? []

export const getCropFamilyById = (id: string | null | undefined): CropFamily =>
  CROP_FAMILIES.find((c) => c.id === id) ?? CROP_FAMILIES[0]
