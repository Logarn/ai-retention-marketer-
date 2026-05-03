import { NextResponse } from "next/server";
import {
  AGENT_TOOL_CATEGORIES,
  AGENT_TOOL_PERMISSION_LEVELS,
  isAgentToolCategory,
  isAgentToolPermissionLevel,
  listAgentTools,
} from "@/lib/agent/tools/registry";
import type { AgentToolFilters } from "@/lib/agent/tools/types";

function parseBooleanFilter(value: string | null) {
  if (value === null || value === "") return { ok: true as const, value: undefined };
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return { ok: true as const, value: true };
  if (normalized === "false") return { ok: true as const, value: false };
  return {
    ok: false as const,
    error: "requiresApproval must be true or false.",
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category")?.trim() || null;
    const permissionLevel = searchParams.get("permissionLevel")?.trim() || null;
    const requiresApproval = parseBooleanFilter(searchParams.get("requiresApproval"));

    if (category && !isAgentToolCategory(category)) {
      return NextResponse.json(
        {
          ok: false,
          error: `category must be one of: ${AGENT_TOOL_CATEGORIES.join(", ")}.`,
        },
        { status: 400 },
      );
    }

    if (permissionLevel && !isAgentToolPermissionLevel(permissionLevel)) {
      return NextResponse.json(
        {
          ok: false,
          error: `permissionLevel must be one of: ${AGENT_TOOL_PERMISSION_LEVELS.join(", ")}.`,
        },
        { status: 400 },
      );
    }

    if (!requiresApproval.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: requiresApproval.error,
        },
        { status: 400 },
      );
    }

    const filters: AgentToolFilters = {
      ...(category && isAgentToolCategory(category) ? { category } : {}),
      ...(permissionLevel && isAgentToolPermissionLevel(permissionLevel)
        ? { permissionLevel }
        : {}),
      ...(typeof requiresApproval.value === "boolean"
        ? { requiresApproval: requiresApproval.value }
        : {}),
    };
    const tools = listAgentTools(filters);

    return NextResponse.json({
      ok: true,
      tools,
      count: tools.length,
      filters,
    });
  } catch (error) {
    console.error("GET /api/agent/tools failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load agent tools",
      },
      { status: 500 },
    );
  }
}
