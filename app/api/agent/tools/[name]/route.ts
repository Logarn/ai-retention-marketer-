import { NextResponse } from "next/server";
import { getAgentToolByName } from "@/lib/agent/tools/registry";

type RouteContext = {
  params: Promise<{ name: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { name } = await context.params;
    const cleanedName = name?.trim();

    if (!cleanedName) {
      return NextResponse.json(
        {
          ok: false,
          error: "tool name is required.",
        },
        { status: 400 },
      );
    }

    const tool = getAgentToolByName(cleanedName);
    if (!tool) {
      return NextResponse.json(
        {
          ok: false,
          error: "Agent tool not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      tool,
    });
  } catch (error) {
    console.error("GET /api/agent/tools/[name] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load agent tool",
      },
      { status: 500 },
    );
  }
}
