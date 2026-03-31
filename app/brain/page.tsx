"use client";

import useSWR from "swr";
import { AlertTriangle, Brain, Lightbulb, Upload, RefreshCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
};

type BrainOverview = {
  profile: {
    id: string | null;
    brandName: string;
    industryVertical: string;
    pricePositioning: string;
    profileCompletion: number;
    voiceCompletion: number;
    rulesCompletion: number;
    productsCompletion: number;
    complianceCompletion: number;
    createdAt: string | null;
    updatedAt: string | null;
  };
  completeness: number;
  freshness: { lastUpdatedAt: string | null; status: "fresh" | "stale" | "empty" };
  checks: Array<{ key: string; label: string; score: number }>;
  metrics: { personas: number; sellingPoints: number; documents: number };
};

export default function BrainOverviewPage() {
  const { data, error, isLoading, mutate } = useSWR<BrainOverview>("/api/brain/overview", fetcher);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-100">
            <Brain className="h-6 w-6 text-violet-300" />
            Sauti Brand Brain
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Central intelligence hub for voice, strategy, and always-on brand memory.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void mutate()}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline">
            <Upload className="h-4 w-4" />
            Upload New Docs
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-300/30 bg-red-300/10">
          <CardContent className="flex items-center gap-2 pt-6 text-red-100">
            <AlertTriangle className="h-4 w-4" />
            Failed to load Brain overview.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Knowledge Status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="secondary">{data?.profile.brandName || "Unconfigured brand"}</Badge>
          <span className="text-zinc-300">
            Last updated:{" "}
            {data?.freshness.lastUpdatedAt
              ? new Date(data.freshness.lastUpdatedAt).toLocaleString()
              : "Not available"}
          </span>
          <Badge variant={data?.freshness.status === "fresh" ? "success" : "warning"}>
            {data?.freshness.status || "empty"}
          </Badge>
          <Badge variant="outline">Completeness: {data?.completeness ?? 0}%</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Brand Knowledge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {isLoading ? (
              <p className="text-zinc-400">Loading...</p>
            ) : (
              <>
                {data?.checks?.map((check) => <Row key={check.key} label={check.label} value={check.score} />)}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fresh Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data?.checks ?? []).length ? (
              (data?.checks ?? [])
                .filter((check) => check.score < 100)
                .slice(0, 3)
                .map((check) => (
                <p key={check.key} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-zinc-200">
                  <Lightbulb className="mr-2 inline h-4 w-4 text-amber-300" />
                  {check.label} has room to improve ({check.score}% complete).
                </p>
              ))
            ) : (
              <p className="text-zinc-400">No insights yet. Complete your Brand Profile to unlock suggestions.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-zinc-300">{label}</span>
        <span className="text-zinc-400">{Math.round(value)}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-blue-400" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}
