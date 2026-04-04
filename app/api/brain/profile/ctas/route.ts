import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/app/api/brain/profile/store";

export async function GET() {
  try {
    const items = await prisma.brandCTA.findMany({
      where: { storeId: DEFAULT_STORE_ID },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load CTAs", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string };
    const text = String(body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    const created = await prisma.brandCTA.create({
      data: {
        storeId: DEFAULT_STORE_ID,
        text,
        isPreferred: true,
      },
    });
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to add CTA", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    await prisma.brandCTA.delete({ where: { id } });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete CTA", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
