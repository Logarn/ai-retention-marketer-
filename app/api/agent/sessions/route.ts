import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "../../brain/profile/store";

export const maxDuration = 10;

const FIRST_MESSAGE = {
  role: "agent" as const,
  content:
    "Hey there! 👋 I'm Worklin — your AI retention marketer. Think of me as that brilliant marketing friend who works 24/7 and never asks for equity.\n\nI learn your brand, study your competitors, plan campaigns, and write emails that actually convert — so you can focus on, you know, running your business.\n\nLet's get you set up. Takes about 5 minutes, and I promise to make it painless.",
  messageType: "chips" as const,
  metadata: JSON.stringify({
    chips: ["Let's do this! 🚀", "Tell me more first", "I'm skeptical but curious"],
  }),
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const latestOnly = url.searchParams.get("latest") === "1";
    if (latestOnly) {
      const session = await prisma.chatSession.findFirst({
        where: { storeId: DEFAULT_STORE_ID },
        orderBy: { updatedAt: "desc" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      return NextResponse.json({ session });
    }

    const sessions = await prisma.chatSession.findMany({
      where: { storeId: DEFAULT_STORE_ID },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        currentStep: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list sessions" },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const session = await prisma.chatSession.create({
      data: {
        storeId: DEFAULT_STORE_ID,
        title: "New Chat",
        status: "onboarding",
        currentStep: 0,
      },
    });

    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: FIRST_MESSAGE.role,
        content: FIRST_MESSAGE.content,
        messageType: FIRST_MESSAGE.messageType,
        metadata: FIRST_MESSAGE.metadata,
      },
    });

    const full = await prisma.chatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json({ session: full }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create session" },
      { status: 500 },
    );
  }
}
