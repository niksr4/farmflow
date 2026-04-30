import { Metadata } from "next"
import LotTracePage from "./lot-trace-page"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lotId: string }>
}): Promise<Metadata> {
  const { lotId } = await params
  return {
    title: `Lot ${lotId} — FarmFlow Trace`,
    description: "Farm-to-sale traceability for this coffee lot.",
    robots: { index: false },
  }
}

export default async function Page({ params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params
  return <LotTracePage lotId={lotId} />
}
