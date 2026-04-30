import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeCampaignMemory, validateCampaignMemoryPayload } from "@/app/api/memory/shared";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const validation = validateCampaignMemoryPayload(body);

    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid campaign memory payload",
          issues: validation.issues,
        },
        { status: 400 },
      );
    }

    const created = await prisma.campaignMemory.create({
      data: validation.data,
    });

    return NextResponse.json(
      {
        ok: true,
        memory: serializeCampaignMemory(created),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/memory/ingest failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to store campaign memory",
      },
      { status: 500 },
    );
  }
}
