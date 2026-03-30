import { getRevenueAttribution } from "@/lib/analytics";

export async function GET() {
  try {
    const data = await getRevenueAttribution();
    return Response.json(data);
  } catch (error) {
    console.error("GET /api/analytics/revenue-attribution error", error);
    return Response.json({ error: "Failed to load revenue attribution" }, { status: 500 });
  }
}
