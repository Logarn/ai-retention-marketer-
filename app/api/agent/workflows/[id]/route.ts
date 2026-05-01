import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  cleanWorkflowId,
  serializeWorkflowRun,
} from "@/app/api/agent/workflows/shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const id = cleanWorkflowId(rawId);

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid workflow request",
          issues: ["workflow id is required."],
        },
        { status: 400 },
      );
    }

    const workflow = await prisma.workflowRun.findUnique({
      where: { id },
    });

    if (!workflow) {
      return NextResponse.json(
        {
          ok: false,
          error: "Workflow run not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      workflow: serializeWorkflowRun(workflow),
    });
  } catch (error) {
    console.error("GET /api/agent/workflows/[id] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load agent workflow",
      },
      { status: 500 },
    );
  }
}
