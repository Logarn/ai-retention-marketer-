"use client";

import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type SegmentRow = {
  key: string;
  label: string;
  count: number;
  averageClv: number;
  color: string;
  recommendedAction: string;
};

export function SegmentsClient() {
  const { data, isLoading } = useSWR<SegmentRow[]>("/api/customers/segments", fetcher);
  const segments = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">RFM Segments</h1>
        <p className="text-sm text-slate-500 mt-1">
          Prioritize retention actions by segment opportunity and customer value.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)
          : segments.map((segment) => (
              <Card key={segment.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between">
                    <span>{segment.label}</span>
                    <Badge style={{ backgroundColor: segment.color, color: "white" }}>{segment.count}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-slate-600">Avg CLV: ${segment.averageClv.toFixed(2)}</p>
                  <p className="text-slate-500">{segment.recommendedAction}</p>
                </CardContent>
              </Card>
            ))}
      </div>
    </div>
  );
}
