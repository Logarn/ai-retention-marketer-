import { NextResponse } from "next/server";
import { isPlaybookType, listPlaybooks } from "@/lib/playbooks";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type")?.trim() || null;

    if (type && !isPlaybookType(type)) {
      return NextResponse.json(
        {
          ok: false,
          error: "type must be either flow or campaign.",
        },
        { status: 400 },
      );
    }
    const playbookType = type && isPlaybookType(type) ? type : undefined;

    return NextResponse.json({
      ok: true,
      playbooks: listPlaybooks(playbookType),
    });
  } catch (error) {
    console.error("GET /api/playbooks failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load playbooks",
      },
      { status: 500 },
    );
  }
}
