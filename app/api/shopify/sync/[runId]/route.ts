import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> | { runId: string } },
) {
  try {
    const resolved = await context.params;
    const runId = resolved.runId;

    const run = await prisma.shopifySyncRun.findUnique({
      where: { id: runId },
    });
    if (!run) {
      return NextResponse.json(
        {
          error: "Sync run not found",
          runId,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      run: {
        id: run.id,
        mode: run.mode,
        status: run.status,
        isBackground: run.isBackground,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        triggeredBy: run.triggeredBy,
        customersFetched: run.customersFetched,
        ordersFetched: run.ordersFetched,
        productsFetched: run.productsFetched,
        customersUpserted: run.customersUpserted,
        ordersUpserted: run.ordersUpserted,
        productsUpserted: run.productsUpserted,
        sinceOrdersAt: run.sinceOrdersAt,
        sinceProductsAt: run.sinceProductsAt,
        warnings: Array.isArray(run.warnings) ? run.warnings : [],
        errorMessage: run.errorMessage,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load Shopify sync run",
        detail: String(error),
      },
      { status: 500 },
    );
  }
}
