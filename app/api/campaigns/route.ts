import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const createCampaignSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["one_time", "automated_flow"]),
  channel: z.enum(["email", "sms", "multi"]),
  status: z.enum(["draft", "active", "paused", "completed"]).default("draft"),
  subject: z.string().optional(),
  body: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  flowConfig: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  try {
    const campaigns = await prisma.campaign.findMany({
      include: { metrics: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(campaigns);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch campaigns", details: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = createCampaignSchema.parse(await request.json());
    const campaignData = {
      name: payload.name,
      type: payload.type,
      channel: payload.channel,
      status: payload.status,
      subject: payload.subject,
      body: payload.body,
      scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
      ...(payload.flowConfig ? { flowConfig: payload.flowConfig } : {}),
    } as Parameters<typeof prisma.campaign.create>[0]["data"];
    const campaign = await prisma.campaign.create({
      data: campaignData,
    });
    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create campaign", details: (error as Error).message },
      { status: 400 },
    );
  }
}
