import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  cleanWorkflowFilter,
  parseWorkflowLimit,
  serializeWorkflowRunSummary,
} from "@/app/api/agent/workflows/shared";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitResult = parseWorkflowLimit(searchParams.get("limit"));
    if (!limitResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: limitResult.error,
        },
        { status: 400 },
      );
    }

    const status = cleanWorkflowFilter(searchParams.get("status"));
    const type = cleanWorkflowFilter(searchParams.get("type"));
    const where: Prisma.WorkflowRunWhereInput = {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
    };

    const workflows = await prisma.workflowRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limitResult.limit,
    });

    return NextResponse.json({
      ok: true,
      workflows: workflows.map(serializeWorkflowRunSummary),
    });
  } catch (error) {
    console.error("GET /api/agent/workflows failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load agent workflows",
      },
      { status: 500 },
    );
  }
}
