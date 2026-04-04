"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Loader2, Search, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type AnalyzerStep = {
  label: string;
  detail: string;
  status: "pending" | "running" | "complete";
};

const initialSteps: AnalyzerStep[] = [
  {
    label: "Homepage analyzed",
    detail: "Hero messaging, value props, trust badges, and nav structure",
    status: "pending",
  },
  {
    label: "About page analyzed",
    detail: "Founder story, mission, and core values detected",
    status: "pending",
  },
  {
    label: "Product pages sampled",
    detail: "Description and review language patterns extracted",
    status: "pending",
  },
  {
    label: "FAQ and footer scanned",
    detail: "Policy language, legal links, and brand signatures captured",
    status: "pending",
  },
];

type BrandProfileResponse = {
  profile: {
    shopifyUrl: string | null;
  };
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
};

export default function BrainAnalyzerPage() {
  const { data: profileData } = useSWR<BrandProfileResponse>("/api/brain/profile", fetcher);
  const [storeUrl, setStoreUrl] = useState("");
  const [steps, setSteps] = useState<AnalyzerStep[]>(initialSteps);
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    // Preload analyzer URL from Brand Profile so crawl can start immediately.
    if (!profileData?.profile.shopifyUrl) return;
    setStoreUrl((current) => current || profileData.profile.shopifyUrl || "");
  }, [profileData?.profile.shopifyUrl]);

  async function runMockAnalysis() {
    if (!storeUrl.trim()) return;
    setRunning(true);
    setComplete(false);
    setSteps(initialSteps);

    for (let i = 0; i < initialSteps.length; i += 1) {
      setSteps((prev) =>
        prev.map((step, idx) =>
          idx === i ? { ...step, status: "running" } : step,
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 900));
      setSteps((prev) =>
        prev.map((step, idx) =>
          idx === i ? { ...step, status: "complete" } : step,
        ),
      );
    }

    setRunning(false);
    setComplete(true);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Store Analyzer</h1>
        <p className="text-sm text-zinc-400">
          Crawl a Shopify storefront and extract brand language and intelligence patterns.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Analyze Shopify Store</CardTitle>
          <CardDescription>
            Phase shell: enter a store URL to run the analyzer simulation UI.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
          <Input
            value={storeUrl}
            onChange={(event) => setStoreUrl(event.target.value)}
            placeholder="https://your-store.myshopify.com"
          />
          <Button onClick={() => void runMockAnalysis()} disabled={running || !storeUrl.trim()}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {running ? "Analyzing..." : "Start Analysis"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-300" />
            Analyzer Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.map((step) => (
            <div
              key={step.label}
              className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-100">{step.label}</p>
                <Badge
                  variant={
                    step.status === "complete"
                      ? "success"
                      : step.status === "running"
                        ? "warning"
                        : "outline"
                  }
                >
                  {step.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-zinc-400">{step.detail}</p>
            </div>
          ))}
          {complete ? (
            <p className="text-sm text-emerald-300">
              <CheckCircle2 className="mr-1 inline h-4 w-4" />
              Analyzer run completed. Next: connect crawler + extraction workers.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
