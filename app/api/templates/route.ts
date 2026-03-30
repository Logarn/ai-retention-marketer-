import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const templates = await prisma.messageTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(templates);
  } catch (error) {
    console.error("templates GET error", error);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, channel, type, subject, body: content } = body as {
      name: string;
      channel: string;
      type: string;
      subject?: string | null;
      body: string;
    };

    if (!name || !channel || !type || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const template = await prisma.messageTemplate.create({
      data: {
        name,
        channel,
        type,
        subject: subject ?? null,
        body: content,
      },
    });
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("templates POST error", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
