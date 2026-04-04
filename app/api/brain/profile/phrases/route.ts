import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/app/api/brain/profile/store";

const ALLOWED_TYPES = new Set(["preferred", "banned"]);

export async function GET() {
  try {
    const phrases = await prisma.brandPhrase.findMany({
      where: { storeId: DEFAULT_STORE_ID },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ phrases });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load phrases",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { phrase?: string; type?: string };
    const phrase = (body.phrase ?? "").trim();
    const type = (body.type ?? "").trim().toLowerCase();

    if (!phrase) return NextResponse.json({ error: "phrase is required" }, { status: 400 });
    if (!ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: "type must be preferred or banned" }, { status: 400 });
    }

    const created = await prisma.brandPhrase.create({
      data: {
        storeId: DEFAULT_STORE_ID,
        phrase,
        type,
      },
    });
    return NextResponse.json({ phrase: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to create phrase",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 });

    await prisma.brandPhrase.delete({
      where: { id },
    });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to delete phrase",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
