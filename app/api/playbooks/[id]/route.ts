import { NextResponse } from "next/server";
import { getPlaybookById } from "@/lib/playbooks";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const cleanedId = id?.trim();

    if (!cleanedId) {
      return NextResponse.json(
        {
          ok: false,
          error: "playbook id is required.",
        },
        { status: 400 },
      );
    }

    const playbook = getPlaybookById(cleanedId);
    if (!playbook) {
      return NextResponse.json(
        {
          ok: false,
          error: "Playbook not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      playbook,
    });
  } catch (error) {
    console.error("GET /api/playbooks/[id] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load playbook",
      },
      { status: 500 },
    );
  }
}
