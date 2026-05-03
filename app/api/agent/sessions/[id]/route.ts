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

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as
      | { messages?: Array<{ role?: unknown; content?: unknown }> }
      | null;

    const session = await prisma.chatSession.findFirst({
      where: { id, storeId: DEFAULT_STORE_ID },
      select: { id: true, title: true },
    });
    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const cleaned = messages
      .map((message) => ({
        role: typeof message.role === "string" ? message.role.trim() : "",
        content: typeof message.content === "string" ? message.content.trim() : "",
      }))
      .filter((message) => ["user", "assistant", "system", "tool"].includes(message.role) && message.content);

    if (!cleaned.length) {
      return NextResponse.json(
        { error: "messages must include at least one role and content pair" },
        { status: 400 },
      );
    }

    await prisma.chatMessage.createMany({
      data: cleaned.map((message) => ({
        sessionId: session.id,
        role: message.role,
        content: message.content,
      })),
    });

    const userTitle = cleaned.find((message) => message.role === "user")?.content;
    if ((!session.title || session.title === "New Chat") && userTitle) {
      await prisma.chatSession.update({
        where: { id: session.id },
        data: {
          title: userTitle.slice(0, 80) + (userTitle.length > 80 ? "..." : ""),
        },
      });
    }

    const full = await prisma.chatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json({ session: full }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to append messages" },
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
