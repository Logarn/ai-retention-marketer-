import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Context = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    await prisma.messageTemplate.delete({
      where: { id },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete template", detail: String(error) },
      { status: 500 },
    );
  }
}
