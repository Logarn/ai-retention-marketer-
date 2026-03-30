import { NextResponse } from "next/server";
import { syncProfilesToKlaviyo } from "@/lib/klaviyo";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    await prisma.integrationState.upsert({
      where: { provider: "klaviyo" },
      create: {
        provider: "klaviyo",
        connected: true,
        syncInProgress: true,
        lastSyncStatus: "in_progress",
        lastSyncMessage: "Syncing profiles to Klaviyo",
      },
      update: {
        connected: true,
        syncInProgress: true,
        lastSyncStatus: "in_progress",
        lastSyncMessage: "Syncing profiles to Klaviyo",
      },
    });

    const result = await syncProfilesToKlaviyo();
    await prisma.integrationState.update({
      where: { provider: "klaviyo" },
      data: {
        syncInProgress: false,
        lastSyncAt: new Date(),
        lastSyncStatus: result.failed > 0 ? "partial_success" : "success",
        lastSyncMessage: `Profiles synced: ${result.synced}/${result.total}`,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    await prisma.integrationState.upsert({
      where: { provider: "klaviyo" },
      create: {
        provider: "klaviyo",
        connected: false,
        syncInProgress: false,
        lastSyncStatus: "error",
        lastSyncMessage: String(error),
      },
      update: {
        syncInProgress: false,
        lastSyncStatus: "error",
        lastSyncMessage: String(error),
      },
    });
    return NextResponse.json(
      { error: "Failed to sync profiles to Klaviyo", details: String(error) },
      { status: 500 },
    );
  }
}
