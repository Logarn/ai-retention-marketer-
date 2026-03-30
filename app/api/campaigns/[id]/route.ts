import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        metrics: true,
        receipts: {
          orderBy: { sentAt: "desc" },
          take: 100,
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    return NextResponse.json(campaign);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch campaign.", detail: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        name: body.name,
        type: body.type,
        channel: body.channel,
        status: body.status,
        subject: body.subject,
        body: body.body,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        flowConfig: body.flowConfig ?? undefined,
      },
    });
    return NextResponse.json(campaign);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update campaign.", detail: (error as Error).message },
      { status: 500 },
    );
  }
}
