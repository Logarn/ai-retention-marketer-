"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, DollarSign, RefreshCcw, Users, UserCheck, ShoppingBag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RevenueChannelBarChart, SegmentPieChart } from "@/components/charts/retention-charts";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
};

type Overview = {
  totalCustomers: number;
  activeCustomers: number;
  averageClv: number;
  repeatPurchaseRate: number;
  averageOrderValue: number;
  churnRate: number;
};

type SegmentEntry = {
  key: string;
  label: string;
  count: number;
  averageClv: number;
  color: string;
  recommendedAction: string;
};

type Cohorts = {
  months: number;
  rows: Array<{
    cohort: string;
    customers: number;
    retention: Record<string, number>;
  }>;
};

type Attribution = {
  byCampaign: Array<{
    campaignId: string;
    campaignName: string;
    channel: string;
    revenue: number;
    sent: number;
    converted: number;
    revenuePerMessage: number;
    conversionRate: number;
  }>;
  byChannel: Array<{
    channel: string;
    revenue: number;
    sent: number;
    converted: number;
    revenuePerMessage: number;
    conversionRate: number;
  }>;
};

type ProductInsights = {
  topRepeatPurchase: Array<{
    productId: string;
    productName: string;
    category: string | null;
    repeatRate: number;
  }>;
  productAffinity: Array<{
    productA: string;
    productB: string;
    overlapOrders: number;
  }>;
  replenishmentWindows: Array<{
    productName: string;
    category: string | null;
    predictedWindowDays: number;
    nextLikelyReorderDate: string;
  }>;
};

type ToastKind = "success" | "error" | "info";

type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
};

type ShopifySyncState = {
  status: string;
  connected: boolean;
  syncInProgress: boolean;
  lastSyncAt: string | null;
  message: string | null;
  activeRunId: string | null;
  activeRun: {
    id: string;
    mode: string;
    status: string;
    isBackground: boolean;
    startedAt: string | null;
    completedAt: string | null;
    customersFetched: number;
    ordersFetched: number;
    productsFetched: number;
    customersUpserted: number;
    ordersUpserted: number;
    productsUpserted: number;
    warnings: string[];
    errorMessage: string | null;
  } | null;
  latestRun: {
    id: string;
    mode: string;
    status: string;
    isBackground: boolean;
    startedAt: string | null;
    completedAt: string | null;
    customersFetched: number;
    ordersFetched: number;
    productsFetched: number;
    customersUpserted: number;
    ordersUpserted: number;
    productsUpserted: number;
    warnings: string[];
    errorMessage: string | null;
  } | null;
};

function MetricCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-xs uppercase tracking-wide text-zinc-400">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-semibold text-zinc-100">{value}</p>
            <p className="mt-1 text-xs text-zinc-400">{subtitle}</p>
          </div>
          <div className="text-zinc-500">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function CohortHeatCell({ value }: { value: number }) {
  const intensity = Math.min(1, value / 100);
  const bg = `rgba(61, 214, 140, ${0.13 + intensity * 0.55})`;
  return (
    <td className="rounded px-2 py-1 text-center text-xs text-zinc-200" style={{ backgroundColor: bg }}>
      {value.toFixed(1)}%
    </td>
  );
}

export function DashboardClient() {
  const [isSyncingShopify, setIsSyncingShopify] = useState(false);
  const [integrationMessage, setIntegrationMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const {
    data: overview,
    error: overviewError,
    isLoading: overviewLoading,
    mutate: refreshOverview,
  } = useSWR<Overview>("/api/analytics/overview", fetcher);
  const { data: rfm, error: rfmError, isLoading: rfmLoading } = useSWR<SegmentEntry[]>(
    "/api/analytics/rfm-distribution",
    fetcher,
  );
  const { data: cohorts, error: cohortsError, isLoading: cohortsLoading } = useSWR<Cohorts>(
    "/api/analytics/cohorts",
    fetcher,
  );
  const { data: attribution, error: attributionError, isLoading: attributionLoading } = useSWR<Attribution>(
    "/api/analytics/revenue-attribution",
    fetcher,
  );
  const { data: productInsights, error: productError, isLoading: productLoading } = useSWR<ProductInsights>(
    "/api/analytics/product-insights",
    fetcher,
  );
  const integrationState = useSWR<ShopifySyncState>("/api/shopify/sync", fetcher, {
    refreshInterval: 12_000,
  });

  const hasError = overviewError || rfmError || cohortsError || attributionError || productError;
  const activeRun = integrationState.data?.activeRun;
  const latestRun = integrationState.data?.latestRun;
  const isPollingRun = Boolean(activeRun?.id);

  useEffect(() => {
    if (!activeRun?.id) return;
    const interval = window.setInterval(() => {
      void integrationState.mutate();
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [activeRun?.id, integrationState]);

  const runWarnings = useMemo(
    () => (activeRun?.warnings?.length ? activeRun.warnings : latestRun?.warnings ?? []),
    [activeRun?.warnings, latestRun?.warnings],
  );

  function pushToast(kind: ToastKind, message: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((previous) => [...previous, { id, kind, message }]);
    setTimeout(() => {
      setToasts((previous) => previous.filter((item) => item.id !== id));
    }, 5000);
  }

  function dismissToast(id: number) {
    setToasts((previous) => previous.filter((item) => item.id !== id));
  }

  function extractApiError(payload: unknown, fallback: string) {
    if (payload && typeof payload === "object") {
      const maybe = payload as { error?: string; detail?: string };
      if (maybe.error && maybe.detail) return `${maybe.error}: ${maybe.detail}`;
      if (maybe.error) return maybe.error;
      if (maybe.detail) return maybe.detail;
    }
    return fallback;
  }

  async function startShopifySync(mode: "full" | "incremental", background: boolean) {
    console.log("[dashboard] Shopify sync request", { mode, background });
    setIsSyncingShopify(true);
    setIntegrationMessage(null);
    try {
      const response = await fetch("/api/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, background }),
      });
      const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        if (json.code === "SHOPIFY_TOKEN_REQUIRED" || json.code === "SHOPIFY_TOKEN_INVALID") {
          pushToast("info", "Shopify is not connected. Redirecting to Connect Shopify.");
          window.location.href = "/api/auth/shopify";
          return;
        }
        throw new Error(extractApiError(json, "Shopify sync failed"));
      }

      if (background) {
        const runId = String(json.runId || "");
        pushToast("info", "Background sync started. Polling live status now.");
        setIntegrationMessage(`Background ${mode} sync started${runId ? ` (run ${runId})` : ""}.`);
      } else {
        pushToast("success", "Shopify sync completed.");
        setIntegrationMessage(String(json.message || "Shopify sync completed."));
      }

      await Promise.all([refreshOverview(), integrationState.mutate()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Shopify sync failed";
      console.error("[dashboard] Shopify sync error", error);
      setIntegrationMessage(message);
      pushToast("error", message);
    } finally {
      setIsSyncingShopify(false);
    }
  }

  function handleConnectShopify() {
    console.log("[dashboard] Connect Shopify clicked");
    window.location.href = "/api/auth/shopify";
  }

  return (
    <div className="space-y-6">
      <div className="fixed right-4 top-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`w-[320px] rounded-xl border px-3 py-2 text-sm shadow-xl backdrop-blur ${
              toast.kind === "success"
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                : toast.kind === "error"
                  ? "border-red-400/40 bg-red-500/15 text-red-100"
                  : "border-sky-400/40 bg-sky-500/15 text-sky-100"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p>{toast.message}</p>
              <button
                type="button"
                aria-label="Dismiss notification"
                className="text-xs opacity-80 hover:opacity-100"
                onClick={() => dismissToast(toast.id)}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Retention Analytics Dashboard</h1>
          <p className="text-sm text-zinc-400">
            Story-first retention analytics to drive repeat purchase growth.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={handleConnectShopify} disabled={isSyncingShopify}>
            Connect Shopify
          </Button>
          <Button
            variant="outline"
            onClick={() => void startShopifySync("incremental", false)}
            disabled={isSyncingShopify}
          >
            {isSyncingShopify ? "Working..." : "Sync Incremental"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void startShopifySync("full", true)}
            disabled={isSyncingShopify}
          >
            Start Background Full Sync
          </Button>
          <Button variant="outline" onClick={() => void refreshOverview()}>
            <RefreshCcw className="h-4 w-4" />
            Refresh metrics
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Shopify Integration Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span>Connection:</span>
            <Badge variant={integrationState.data?.connected ? "success" : "warning"}>
              {integrationState.data?.connected ? "Connected" : "Not connected"}
            </Badge>
            <span>Sync status:</span>
            <Badge
              variant={
                integrationState.data?.status === "success"
                  ? "success"
                  : integrationState.data?.status === "error"
                    ? "destructive"
                    : "outline"
              }
            >
              {integrationState.data?.status ?? "idle"}
            </Badge>
            {isPollingRun ? <Badge variant="secondary">Polling live run</Badge> : null}
          </div>
          <p>
            Last sync:{" "}
            {integrationState.data?.lastSyncAt
              ? new Date(integrationState.data.lastSyncAt).toLocaleString()
              : "Not synced yet"}
          </p>
          {integrationState.data?.message ? (
            <p className="text-zinc-300">{integrationState.data.message}</p>
          ) : null}
          {integrationMessage ? <p className="text-zinc-300">{integrationMessage}</p> : null}

          {(activeRun || latestRun) && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-400">
                {activeRun ? "Active run" : "Last run"}
              </p>
              <p className="mt-1 text-sm text-zinc-200">
                {(activeRun || latestRun)?.mode} | {(activeRun || latestRun)?.status} | run{" "}
                {(activeRun || latestRun)?.id}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                fetched c/o/p: {(activeRun || latestRun)?.customersFetched ?? 0}/
                {(activeRun || latestRun)?.ordersFetched ?? 0}/
                {(activeRun || latestRun)?.productsFetched ?? 0}
                {" · "}
                upserted c/o/p: {(activeRun || latestRun)?.customersUpserted ?? 0}/
                {(activeRun || latestRun)?.ordersUpserted ?? 0}/
                {(activeRun || latestRun)?.productsUpserted ?? 0}
              </p>
              {(activeRun || latestRun)?.errorMessage ? (
                <p className="mt-2 text-xs text-red-200">{(activeRun || latestRun)?.errorMessage}</p>
              ) : null}
              {runWarnings.length ? (
                <div className="mt-2 space-y-1">
                  {runWarnings.map((warning, index) => (
                    <p key={`${warning}-${index}`} className="text-xs text-amber-200">
                      Warning: {warning}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {hasError && (
        <Card className="border-red-300/30 bg-red-300/10">
          <CardContent className="flex items-center gap-2 pt-6 text-red-100">
            <AlertTriangle className="h-4 w-4" />
            Some dashboard modules failed to load. Check API/database configuration.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {overviewLoading || !overview ? (
          Array.from({ length: 6 }).map((_, idx) => <Skeleton key={idx} className="h-32" />)
        ) : (
          <>
            <MetricCard
              title="Total customers"
              value={overview.totalCustomers.toLocaleString()}
              subtitle="Current customer base"
              icon={<Users className="h-5 w-5" />}
            />
            <MetricCard
              title="Active customers (90d)"
              value={overview.activeCustomers.toLocaleString()}
              subtitle="Purchased in last 90 days"
              icon={<UserCheck className="h-5 w-5" />}
            />
            <MetricCard
              title="Average CLV"
              value={`$${overview.averageClv.toFixed(2)}`}
              subtitle="Average lifetime spend"
              icon={<DollarSign className="h-5 w-5" />}
            />
            <MetricCard
              title="Repeat purchase rate"
              value={`${overview.repeatPurchaseRate.toFixed(1)}%`}
              subtitle="Customers with 2+ orders"
              icon={<RefreshCcw className="h-5 w-5" />}
            />
            <MetricCard
              title="Average order value"
              value={`$${overview.averageOrderValue.toFixed(2)}`}
              subtitle="Revenue per order"
              icon={<ShoppingBag className="h-5 w-5" />}
            />
            <MetricCard
              title="Churn rate"
              value={`${overview.churnRate.toFixed(1)}%`}
              subtitle="Inactive over 90 days"
              icon={<AlertTriangle className="h-5 w-5" />}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>RFM Segment Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {rfmLoading || !rfm ? (
              <Skeleton className="h-72" />
            ) : (
              <>
                <SegmentPieChart data={rfm} />
                <div className="grid gap-2">
                  {rfm.map((segment) => (
                    <div key={segment.key} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge style={{ backgroundColor: segment.color, color: "white" }}>{segment.label}</Badge>
                          <span className="text-sm text-zinc-400">{segment.count} customers</span>
                        </div>
                        <span className="text-sm font-medium text-zinc-200">${segment.averageClv.toFixed(0)} avg CLV</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">{segment.recommendedAction}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue by Channel</CardTitle>
          </CardHeader>
          <CardContent>
            {attributionLoading || !attribution ? (
              <Skeleton className="h-72" />
            ) : (
              <RevenueChannelBarChart data={attribution.byChannel} />
            )}
            <div className="mt-3 grid gap-2">
              {attribution?.byChannel.map((entry) => (
                <div key={entry.channel} className="flex justify-between rounded-xl border border-white/10 px-3 py-2 text-sm">
                  <span className="capitalize">{entry.channel}</span>
                  <span className="text-zinc-300">
                    ${entry.revenue.toFixed(2)} ({entry.revenuePerMessage.toFixed(2)} / message)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Cohort Retention</CardTitle>
        </CardHeader>
        <CardContent>
          {cohortsLoading || !cohorts ? (
            <Skeleton className="h-80" />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full border-separate border-spacing-y-1">
                <thead>
                  <tr className="text-xs text-zinc-400">
                    <th className="text-left px-2 py-1">Cohort</th>
                    <th className="text-left px-2 py-1">Customers</th>
                    {Array.from({ length: cohorts.months + 1 }).map((_, monthIdx) => (
                      <th key={monthIdx} className="text-center px-2 py-1">
                        M{monthIdx}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.rows.map((row) => (
                    <tr key={row.cohort}>
                      <td className="px-2 py-1 text-sm font-medium text-zinc-200">{row.cohort}</td>
                      <td className="px-2 py-1 text-sm text-zinc-400">{row.customers}</td>
                      {Array.from({ length: cohorts.months + 1 }).map((_, monthIdx) => (
                        <CohortHeatCell
                          key={monthIdx}
                          value={row.retention[`m${monthIdx}`] ?? 0}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Products by Repeat Purchase Rate</CardTitle>
          </CardHeader>
          <CardContent>
            {productLoading || !productInsights ? (
              <Skeleton className="h-72" />
            ) : (
              <div className="space-y-2">
                {productInsights.topRepeatPurchase.slice(0, 8).map((product) => (
                  <div key={product.productId} className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">{product.productName}</p>
                      <p className="text-xs text-zinc-400">{product.category || "Uncategorized"}</p>
                    </div>
                    <Badge variant="outline">{product.repeatRate.toFixed(1)}%</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Product Affinities</CardTitle>
          </CardHeader>
          <CardContent>
            {productLoading || !productInsights ? (
              <Skeleton className="h-72" />
            ) : (
              <div className="space-y-2">
                {productInsights.productAffinity.slice(0, 8).map((pair, idx) => (
                  <div key={`${pair.productA}-${pair.productB}-${idx}`} className="rounded-xl border border-white/10 px-3 py-2">
                    <p className="text-sm font-medium text-zinc-100">
                      {pair.productA} + {pair.productB}
                    </p>
                    <p className="text-xs text-zinc-400">{pair.overlapOrders} overlapping orders</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
