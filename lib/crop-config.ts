export type CropFamily = {
  id: string
  label: string
  varieties: string[]
  notes?: string
}

// Coffee remains the default product, but this list helps you expand later.
export const CROP_FAMILIES: CropFamily[] = [
  {
    id: "coffee",
    label: "Coffee",
    varieties: ["Arabica", "Robusta"],
    notes: "Primary coffee varieties typically tracked by estates.",
  },
  {
    id: "tea",
    label: "Tea",
    varieties: ["Assam", "Darjeeling", "Nilgiri", "Ceylon", "Kenya", "Yunnan"],
  },
  {
    id: "cocoa",
    label: "Cocoa",
    varieties: ["Forastero", "Criollo", "Trinitario"],
  },
  {
    id: "spices",
    label: "Spices",
    varieties: ["Pepper", "Cardamom", "Clove", "Cinnamon", "Vanilla", "Nutmeg"],
  },
  {
    id: "tree_nuts",
    label: "Tree Nuts",
    varieties: ["Cashew", "Macadamia", "Hazelnut", "Almond"],
  },
  {
    id: "grains",
    label: "Grains",
    varieties: ["Rice", "Maize", "Wheat", "Millet", "Sorghum"],
  },
  {
    id: "horticulture",
    label: "Horticulture",
    varieties: ["Banana", "Pineapple", "Avocado", "Mango", "Citrus"],
  },
]

export const DEFAULT_COFFEE_VARIETIES = CROP_FAMILIES.find((crop) => crop.id === "coffee")?.varieties ?? []
