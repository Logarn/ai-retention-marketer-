import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/app/api/brain/profile/store";

export const maxDuration = 10;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await prisma.chatSession.findFirst({
      where: { id, storeId: DEFAULT_STORE_ID },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load session" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const deleted = await prisma.chatSession.deleteMany({
      where: { id, storeId: DEFAULT_STORE_ID },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete session" },
      { status: 500 },
    );
  }
}
