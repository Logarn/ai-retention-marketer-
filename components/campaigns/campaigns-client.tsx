"use client";

import Link from "next/link";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Campaign = {
  id: string;
  name: string;
  type: string;
  channel: string;
  status: string;
  metrics?: {
    sent: number;
    converted: number;
    revenue: number;
  } | null;
};

export function CampaignsClient() {
  const { data, isLoading, mutate } = useSWR<Campaign[]>("/api/campaigns", fetcher);
  const campaigns = data ?? [];

  const toggleStatus = async (campaign: Campaign) => {
    const endpoint =
      campaign.status === "active"
        ? `/api/campaigns/${campaign.id}/pause`
        : `/api/campaigns/${campaign.id}/activate`;
    await fetch(endpoint, { method: "POST" });
    await mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <Link href="/campaigns/new">
          <Button>Create campaign</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid gap-3">
          {campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{campaign.name}</span>
                  <Badge variant={campaign.status === "active" ? "success" : "outline"}>
                    {campaign.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-slate-600">
                  {campaign.type} · {campaign.channel}
                </div>
                <div className="text-slate-600">
                  Sent: {campaign.metrics?.sent ?? 0} · Converted: {campaign.metrics?.converted ?? 0} · Revenue: $
                  {(campaign.metrics?.revenue ?? 0).toFixed(2)}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => void toggleStatus(campaign)}>
                    {campaign.status === "active" ? "Pause" : "Activate"}
                  </Button>
                  <Link href={`/campaigns/${campaign.id}`}>
                    <Button variant="ghost">View</Button>
                  </Link>
                  <Link href={`/campaigns/${campaign.id}/edit`}>
                    <Button variant="ghost">Edit</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
