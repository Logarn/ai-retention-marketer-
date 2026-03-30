import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const campaign = await prisma.campaign.update({
      where: { id },
      data: { status: "active" },
    });
    return NextResponse.json(campaign);
  } catch {
    return NextResponse.json({ error: "Unable to activate campaign" }, { status: 500 });
  }
}
