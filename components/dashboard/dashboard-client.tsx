"use client";

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
        <CardTitle className="text-sm text-slate-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
          </div>
          <div className="text-slate-400">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function CohortHeatCell({ value }: { value: number }) {
  const intensity = Math.min(1, value / 100);
  const bg = `rgba(34, 197, 94, ${0.1 + intensity * 0.6})`;
  return (
    <td className="px-2 py-1 text-xs text-center rounded" style={{ backgroundColor: bg }}>
      {value.toFixed(1)}%
    </td>
  );
}

export function DashboardClient() {
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

  const hasError = overviewError || rfmError || cohortsError || attributionError || productError;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Retention Analytics Dashboard</h1>
          <p className="text-sm text-slate-500">
            Story-first retention analytics to drive repeat purchase growth.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refreshOverview()}>
          <RefreshCcw className="h-4 w-4" />
          Refresh metrics
        </Button>
      </div>

      {hasError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 flex gap-2 items-center text-red-700">
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
                    <div key={segment.key} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge style={{ backgroundColor: segment.color, color: "white" }}>{segment.label}</Badge>
                          <span className="text-sm text-slate-500">{segment.count} customers</span>
                        </div>
                        <span className="text-sm font-medium">${segment.averageClv.toFixed(0)} avg CLV</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{segment.recommendedAction}</p>
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
                <div key={entry.channel} className="text-sm flex justify-between border rounded px-3 py-2">
                  <span className="capitalize">{entry.channel}</span>
                  <span>
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
                  <tr className="text-xs text-slate-500">
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
                      <td className="px-2 py-1 font-medium text-sm">{row.cohort}</td>
                      <td className="px-2 py-1 text-sm text-slate-600">{row.customers}</td>
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
                  <div key={product.productId} className="flex items-center justify-between rounded border px-3 py-2">
                    <div>
                      <p className="font-medium text-sm">{product.productName}</p>
                      <p className="text-xs text-slate-500">{product.category || "Uncategorized"}</p>
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
                  <div key={`${pair.productA}-${pair.productB}-${idx}`} className="rounded border px-3 py-2">
                    <p className="text-sm font-medium">
                      {pair.productA} + {pair.productB}
                    </p>
                    <p className="text-xs text-slate-500">{pair.overlapOrders} overlapping orders</p>
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
