import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/app/api/brain/profile/store";

function sanitizeType(value: unknown): "do" | "dont" {
  const normalized = String(value ?? "").toLowerCase();
  return normalized === "dont" ? "dont" : "do";
}

function sanitizePriority(value: unknown): "critical" | "important" | "nice-to-have" {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "critical" || normalized === "nice-to-have") return normalized;
  return "important";
}

export async function GET() {
  try {
    const rules = await prisma.brandRule.findMany({
      where: { storeId: DEFAULT_STORE_ID },
      orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ rules });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load brand rules",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      rule?: unknown;
      type?: unknown;
      priority?: unknown;
    };
    const rule = String(body.rule ?? "").trim();
    if (!rule) {
      return NextResponse.json({ error: "rule is required" }, { status: 400 });
    }

    const created = await prisma.brandRule.create({
      data: {
        storeId: DEFAULT_STORE_ID,
        rule,
        type: sanitizeType(body.type),
        priority: sanitizePriority(body.priority),
      },
    });
    return NextResponse.json({ rule: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to add brand rule",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    }

    await prisma.brandRule.delete({
      where: { id },
    });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to delete brand rule",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
