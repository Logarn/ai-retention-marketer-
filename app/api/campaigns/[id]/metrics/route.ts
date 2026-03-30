import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const metrics = await prisma.campaignMetrics.findUnique({
      where: { campaignId: id },
    });
    if (!metrics) {
      return NextResponse.json({ error: "Metrics not found" }, { status: 404 });
    }
    return NextResponse.json(metrics);
  } catch (error) {
    console.error("campaign metrics api error", error);
    return NextResponse.json({ error: "Failed to fetch campaign metrics" }, { status: 500 });
  }
}
