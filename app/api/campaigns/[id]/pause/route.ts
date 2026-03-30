import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(_req: NextRequest, ctx: Context) {
  const { id } = await ctx.params;
  const campaign = await prisma.campaign.update({
    where: { id },
    data: { status: "paused" },
  });
  return Response.json(campaign);
}
