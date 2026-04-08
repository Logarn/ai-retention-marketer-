import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  formatSyncSummaryMessage,
  getShopifyTokenFromState,
  getSyncCursorFromState,
  sanitizeShopifyErrorMessage,
  serializeWarnings,
  syncShopifyData,
  toSyncDebugPayload,
  type ShopifySyncMode,
  type ShopifySyncSummary,
} from "@/lib/shopify";

type RunRow = Awaited<ReturnType<typeof prisma.shopifySyncRun.findUnique>>;

declare global {
  // eslint-disable-next-line no-var
  var __shopifySyncJobs: Map<string, Promise<void>> | undefined;
}

function getJobMap() {
  if (!global.__shopifySyncJobs) {
    global.__shopifySyncJobs = new Map<string, Promise<void>>();
  }
  return global.__shopifySyncJobs;
}

function parseWarnings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function toRunResponse(run: RunRow) {
  if (!run) return null;
  return {
    id: run.id,
    mode: run.mode,
    status: run.status,
    triggeredBy: run.triggeredBy,
    isBackground: run.isBackground,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    sinceOrdersAt: run.sinceOrdersAt,
    sinceProductsAt: run.sinceProductsAt,
    customersFetched: run.customersFetched,
    ordersFetched: run.ordersFetched,
    productsFetched: run.productsFetched,
    customersUpserted: run.customersUpserted,
    ordersUpserted: run.ordersUpserted,
    productsUpserted: run.productsUpserted,
    warnings: parseWarnings(run.warnings),
    errorMessage: run.errorMessage,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function parseWarningsJson(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

async function updateStateForMissingToken(detail: string) {
  await prisma.integrationState.upsert({
    where: { provider: "shopify" },
    create: {
      provider: "shopify",
      connected: false,
      syncInProgress: false,
      lastSyncStatus: "needs_connection",
      lastSyncMessage: detail,
    },
    update: {
      connected: false,
      syncInProgress: false,
      lastSyncStatus: "needs_connection",
      lastSyncMessage: detail,
    },
  });
}

async function runShopifySync(input: {
  runId: string;
  mode: ShopifySyncMode;
  token: string;
  triggeredBy: string;
  isBackground: boolean;
  currentState: Awaited<ReturnType<typeof prisma.integrationState.findUnique>>;
}) {
  const cursor = getSyncCursorFromState(input.currentState, input.mode);

  await prisma.shopifySyncRun.update({
    where: { id: input.runId },
    data: {
      status: "in_progress",
      startedAt: new Date(),
      sinceOrdersAt: cursor.ordersSinceAt,
      sinceProductsAt: cursor.productsSinceAt,
    },
  });

  await prisma.integrationState.upsert({
    where: { provider: "shopify" },
    create: {
      provider: "shopify",
      connected: true,
      accessToken: input.token,
      syncInProgress: true,
      lastSyncStatus: "in_progress",
      lastSyncMessage: `Shopify ${input.mode} sync started`,
      shopifyLastRunId: input.runId,
    },
    update: {
      connected: true,
      accessToken: input.token,
      syncInProgress: true,
      lastSyncStatus: "in_progress",
      lastSyncMessage: `Shopify ${input.mode} sync started`,
      shopifyLastRunId: input.runId,
    },
  });

  try {
    const summary = await syncShopifyData({
      token: input.token,
      mode: input.mode,
      state: cursor,
    });
    await finalizeSuccessfulRun(input.runId, input.token, summary);
    return summary;
  } catch (error) {
    const message = sanitizeShopifyErrorMessage(
      error instanceof Error ? error.message : "Unknown Shopify sync error",
    );
    await prisma.shopifySyncRun.update({
      where: { id: input.runId },
      data: {
        status: "error",
        completedAt: new Date(),
        errorMessage: message,
      },
    });
    await prisma.integrationState.upsert({
      where: { provider: "shopify" },
      create: {
        provider: "shopify",
        connected: false,
        syncInProgress: false,
        lastSyncStatus: "error",
        lastSyncMessage: message,
        shopifyLastRunId: input.runId,
      },
      update: {
        syncInProgress: false,
        connected: false,
        lastSyncStatus: "error",
        lastSyncMessage: message,
        shopifyLastRunId: input.runId,
      },
    });
    throw error;
  }
}

async function finalizeSuccessfulRun(runId: string, token: string, summary: ShopifySyncSummary) {
  await prisma.shopifySyncRun.update({
    where: { id: runId },
    data: {
      status: "success",
      completedAt: new Date(),
      customersFetched: summary.customersFetched,
      ordersFetched: summary.ordersFetched,
      productsFetched: summary.productsFetched,
      customersUpserted: summary.customersUpserted,
      ordersUpserted: summary.ordersUpserted,
      productsUpserted: summary.productsUpserted,
      warnings: serializeWarnings(summary.warnings),
      sinceOrdersAt: summary.ordersSinceAt,
      sinceProductsAt: summary.productsSinceAt,
    },
  });

  await prisma.integrationState.update({
    where: { provider: "shopify" },
    data: {
      connected: true,
      accessToken: token,
      syncInProgress: false,
      lastSyncAt: new Date(),
      lastSyncStatus: "success",
      lastSyncMessage: formatSyncSummaryMessage(summary),
      shopifyLastOrdersSyncAt: summary.ordersSinceAt,
      shopifyLastProductsSyncAt: summary.productsSinceAt,
      shopifyLastCustomersSyncAt: summary.customersSinceAt,
      shopifyLastRunId: runId,
    },
  });
}

function normalizeMode(input: unknown): ShopifySyncMode {
  return input === "full" ? "full" : "incremental";
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      mode?: unknown;
      background?: unknown;
      triggeredBy?: unknown;
    };
    const mode = normalizeMode(payload.mode);
    const background = Boolean(payload.background);
    const triggeredBy = typeof payload.triggeredBy === "string" ? payload.triggeredBy : "dashboard";

    const currentState = await prisma.integrationState.findUnique({
      where: { provider: "shopify" },
    });

    if (currentState?.syncInProgress) {
      const activeRun = currentState.shopifyLastRunId
        ? await prisma.shopifySyncRun.findUnique({ where: { id: currentState.shopifyLastRunId } })
        : await prisma.shopifySyncRun.findFirst({
            where: { status: "in_progress" },
            orderBy: { createdAt: "desc" },
          });

      return NextResponse.json(
        {
          error: "Shopify sync already in progress",
          code: "SHOPIFY_SYNC_IN_PROGRESS",
          run: toRunResponse(activeRun),
        },
        { status: 409 },
      );
    }

    const tokenResult = await getShopifyTokenFromState();
    console.log("[shopify-sync] token source:", tokenResult.tokenSource ?? "none");
    if (!tokenResult.token) {
      const detail =
        "Shopify Admin token is missing. Connect Shopify (OAuth) or configure SHOPIFY_ACCESS_TOKEN.";
      await updateStateForMissingToken(detail);
      return NextResponse.json(
        {
          error: "Shopify connection required",
          detail,
          code: "SHOPIFY_TOKEN_REQUIRED",
        },
        { status: 400 },
      );
    }

    const run = await prisma.shopifySyncRun.create({
      data: {
        mode,
        status: background ? "queued" : "in_progress",
        triggeredBy,
        isBackground: background,
      },
    });

    await prisma.integrationState.upsert({
      where: { provider: "shopify" },
      create: {
        provider: "shopify",
        connected: true,
        accessToken: tokenResult.token,
        syncInProgress: true,
        lastSyncStatus: background ? "queued" : "in_progress",
        lastSyncMessage: background
          ? `Shopify ${mode} sync queued`
          : `Shopify ${mode} sync started`,
        shopifyLastRunId: run.id,
      },
      update: {
        connected: true,
        accessToken: tokenResult.token,
        syncInProgress: true,
        lastSyncStatus: background ? "queued" : "in_progress",
        lastSyncMessage: background
          ? `Shopify ${mode} sync queued`
          : `Shopify ${mode} sync started`,
        shopifyLastRunId: run.id,
      },
    });

    if (background) {
      const jobs = getJobMap();
      const job: Promise<void> = runShopifySync({
        runId: run.id,
        mode,
        token: tokenResult.token,
        triggeredBy,
        isBackground: true,
        currentState: tokenResult.state,
      })
        .then(() => undefined)
        .catch((error) => {
          console.error("[shopify-sync] Background sync failed", { runId: run.id, error });
        })
        .finally(() => {
          jobs.delete(run.id);
        });
      jobs.set(run.id, job);

      return NextResponse.json({
        ok: true,
        accepted: true,
        runId: run.id,
        mode,
        status: "queued",
      });
    }

    const summary = await runShopifySync({
      runId: run.id,
      mode,
      token: tokenResult.token,
      triggeredBy,
      isBackground: false,
      currentState: tokenResult.state,
    });

    const refreshedRun = await prisma.shopifySyncRun.findUnique({ where: { id: run.id } });
    return NextResponse.json({
      ok: true,
      accepted: false,
      runId: run.id,
      mode,
      summary: {
        customers: summary.customersUpserted,
        orders: summary.ordersUpserted,
        products: summary.productsUpserted,
        fetched: {
          customers: summary.customersFetched,
          orders: summary.ordersFetched,
          products: summary.productsFetched,
        },
      },
      warnings: summary.warnings,
      run: toRunResponse(refreshedRun),
    });
  } catch (error) {
    const message = sanitizeShopifyErrorMessage(
      error instanceof Error ? error.message : "Unknown Shopify sync error",
    );
    console.error("[shopify-sync] POST failed", error);
    return NextResponse.json(
      {
        error: "Shopify sync failed",
        detail: message,
        code: /401|unauthorized|invalid.*token/i.test(message)
          ? "SHOPIFY_TOKEN_INVALID"
          : "SHOPIFY_SYNC_ERROR",
        debug: toSyncDebugPayload(),
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const runId = request.nextUrl.searchParams.get("runId");
    const state = await prisma.integrationState.findUnique({
      where: { provider: "shopify" },
    });

    const latestRun = runId
      ? await prisma.shopifySyncRun.findUnique({ where: { id: runId } })
      : state?.shopifyLastRunId
        ? await prisma.shopifySyncRun.findUnique({ where: { id: state.shopifyLastRunId } })
        : await prisma.shopifySyncRun.findFirst({
            orderBy: { createdAt: "desc" },
          });

    const activeRun = state?.syncInProgress
      ? state?.shopifyLastRunId
        ? await prisma.shopifySyncRun.findUnique({ where: { id: state.shopifyLastRunId } })
        : await prisma.shopifySyncRun.findFirst({
            where: { status: { in: ["queued", "in_progress"] } },
            orderBy: { createdAt: "desc" },
          })
      : null;

    return NextResponse.json({
      connected: state?.connected ?? false,
      status: state?.lastSyncStatus ?? "idle",
      syncInProgress: state?.syncInProgress ?? false,
      lastSyncAt: state?.lastSyncAt ?? null,
      message: state?.lastSyncMessage ?? null,
      activeRunId: activeRun?.id ?? null,
      activeRun: toRunResponse(activeRun),
      mode: latestRun?.mode ?? "incremental",
      runId: latestRun?.id ?? null,
      latestRun: toRunResponse(latestRun),
      lastWarnings: parseWarningsJson(latestRun?.warnings),
      cursor: {
        ordersSinceAt: state?.shopifyLastOrdersSyncAt ?? null,
        productsSinceAt: state?.shopifyLastProductsSyncAt ?? null,
        customersSinceAt: state?.shopifyLastCustomersSyncAt ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load Shopify integration state", detail: String(error) },
      { status: 500 },
    );
  }
}
