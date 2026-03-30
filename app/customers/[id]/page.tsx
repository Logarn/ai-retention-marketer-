"use client";

import useSWR from "swr";
import { use } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolved = use(params);
  const id = encodeURIComponent(resolved.id);
  const { data, isLoading } = useSWR(`/api/customers/${id}`, fetcher);
  const customer = data;

  return (
    <div className="space-y-6">
      {isLoading || !customer ? (
        <>
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
        </>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                {customer.firstName} {customer.lastName}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600 grid gap-2 md:grid-cols-3">
              <p>Email: {customer.email}</p>
              <p>Total Orders: {customer.totalOrders}</p>
              <p>Total Spent: ${customer.totalSpent?.toFixed?.(2) ?? "0.00"}</p>
              <p>
                Segment: <Badge variant="outline">{customer.segment || "unknown"}</Badge>
              </p>
              <p>Churn Risk: {customer.churnRiskScore ?? 0}</p>
              <p>Last Order: {customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString() : "-"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Orders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(customer.orders ?? []).slice(0, 20).map((order: { id: string; orderNumber: string; createdAt: string; totalAmount: number }) => (
                <div key={order.id} className="rounded border px-3 py-2 text-sm flex justify-between">
                  <span>{order.orderNumber}</span>
                  <span>
                    {new Date(order.createdAt).toLocaleDateString()} · ${order.totalAmount.toFixed(2)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
