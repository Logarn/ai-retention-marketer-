import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "../store";

type CreatePayload = {
  leftLabel?: string;
  rightLabel?: string;
  description?: string | null;
  value?: number;
};

type UpdatePayload = {
  id?: string;
  value?: number;
};

export async function GET() {
  try {
    const dimensions = await prisma.customVoiceDimension.findMany({
      where: { storeId: DEFAULT_STORE_ID },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ dimensions });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load custom voice dimensions", detail: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreatePayload;
    const leftLabel = String(body.leftLabel ?? "").trim();
    const rightLabel = String(body.rightLabel ?? "").trim();
    if (!leftLabel || !rightLabel) {
      return NextResponse.json(
        { error: "leftLabel and rightLabel are required" },
        { status: 400 },
      );
    }
    const value = Number.isFinite(Number(body.value)) ? Number(body.value) : 50;
    const created = await prisma.customVoiceDimension.create({
      data: {
        storeId: DEFAULT_STORE_ID,
        leftLabel,
        rightLabel,
        description: body.description ?? null,
        value: Math.max(0, Math.min(100, Math.round(value))),
      },
    });
    return NextResponse.json({ dimension: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to add custom voice dimension", detail: String(error) },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as UpdatePayload & Partial<CreatePayload>;
    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const value = Number.isFinite(Number(body.value)) ? Number(body.value) : 50;
    const leftLabel =
      typeof body.leftLabel === "string" ? body.leftLabel.trim() : undefined;
    const rightLabel =
      typeof body.rightLabel === "string" ? body.rightLabel.trim() : undefined;
    const description =
      typeof body.description === "string" ? body.description : undefined;
    const updated = await prisma.customVoiceDimension.update({
      where: { id },
      data: {
        value: Math.max(0, Math.min(100, Math.round(value))),
        ...(leftLabel ? { leftLabel } : {}),
        ...(rightLabel ? { rightLabel } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    });
    return NextResponse.json({ dimension: updated });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update custom voice dimension", detail: String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = (url.searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await prisma.customVoiceDimension.delete({ where: { id } });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete custom voice dimension", detail: String(error) },
      { status: 500 },
    );
  }
}
