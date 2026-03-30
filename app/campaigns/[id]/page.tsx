"use client";

import useSWR from "swr";
import { use } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const encodedId = encodeURIComponent(id);
  const { data, isLoading } = useSWR(`/api/campaigns/${encodedId}`, fetcher);

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{data.channel}</Badge>
          <Badge variant="secondary">{data.status}</Badge>
          <Link href={`/campaigns/${encodedId}/edit`}>
            <Button variant="outline">Edit</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campaign Metrics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-6 text-sm">
          <div className="rounded border p-3">
            <p className="text-slate-500">Sent</p>
            <p className="text-xl font-semibold">{data.metrics?.sent ?? 0}</p>
          </div>
          <div className="rounded border p-3">
            <p className="text-slate-500">Delivered</p>
            <p className="text-xl font-semibold">{data.metrics?.delivered ?? 0}</p>
          </div>
          <div className="rounded border p-3">
            <p className="text-slate-500">Opened</p>
            <p className="text-xl font-semibold">{data.metrics?.opened ?? 0}</p>
          </div>
          <div className="rounded border p-3">
            <p className="text-slate-500">Clicked</p>
            <p className="text-xl font-semibold">{data.metrics?.clicked ?? 0}</p>
          </div>
          <div className="rounded border p-3">
            <p className="text-slate-500">Converted</p>
            <p className="text-xl font-semibold">{data.metrics?.converted ?? 0}</p>
          </div>
          <div className="rounded border p-3">
            <p className="text-slate-500">Revenue</p>
            <p className="text-xl font-semibold">${(data.metrics?.revenue ?? 0).toFixed(2)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
