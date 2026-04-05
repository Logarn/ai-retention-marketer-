"use client";

import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  Brain,
  ClipboardList,
  FileSearch,
  FileText,
  Gauge,
  Mic2,
  TestTube2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  freshness: { lastUpdatedAt: string | null; status: "fresh" | "stale" | "empty" };
  quickStats?: {
    personas: number;
    sellingPoints: number;
    documents: number;
    requiredFieldsComplete: number;
    requiredFieldsTotal: number;
  };
  alerts: string[];
};

export default function BrainOverviewPage() {
  const { data, error, isLoading, mutate } = useSWR<BrainOverview>("/api/brain/overview", fetcher);

  const sections = [
    {
      key: "overview",
      name: "Overview",
      href: "/brain",
      icon: Gauge,
      description: "Monitor My Brain completeness and freshness at a glance.",
      score: calculateSectionScore(data?.profile, "overview"),
    },
    {
      key: "profile",
      name: "Brand Profile",
      href: "/brain/profile",
      icon: Brain,
      description: "Company identity, audience, story, and unique positioning.",
      score: data?.profile.profileCompletion ?? 0,
    },
    {
      key: "voice",
      name: "Voice & Tone",
      href: "/brain/voice",
      icon: Mic2,
      description: "Tune voice sliders, phrase banks, and CTA preferences.",
      score: data?.profile.voiceCompletion ?? 0,
    },
    {
      key: "rules",
      name: "Do's & Don'ts",
      href: "/brain/rules",
      icon: ClipboardList,
      description: "Define critical, important, and nice-to-have messaging rules.",
      score: data?.profile.rulesCompletion ?? 0,
    },
    {
      key: "analyzer",
      name: "Store Analyzer",
      href: "/brain/analyzer",
      icon: FileSearch,
      description: "Crawl Shopify pages and extract brand intelligence patterns.",
      score: calculateSectionScore(data?.profile, "analyzer"),
    },
    {
      key: "documents",
      name: "Documents",
      href: "/brain/documents",
      icon: FileText,
      description: "Upload docs and convert guidelines into structured rules.",
      score: calculateSectionScore(data?.profile, "documents", data?.quickStats?.documents ?? 0),
    },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-100">
            <Brain className="h-6 w-6 text-violet-300" />
            My Brain
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Central intelligence hub for voice, strategy, and high-converting brand memory.
          </p>
        </div>
        <Badge variant={data?.freshness.status === "fresh" ? "success" : "warning"}>
          {data?.freshness.status ?? "empty"}
        </Badge>
      </div>

      {error && (
        <Card className="border-red-300/30 bg-red-300/10">
          <CardContent className="flex items-center gap-2 pt-6 text-red-100">
            <AlertTriangle className="h-4 w-4" />
            Failed to load My Brain overview.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => {
          const Icon = section.icon;
          const status = sectionStatus(section.score);
          return (
            <Link key={section.key} href={section.href}>
              <Card className="h-full border-white/10 bg-white/[0.02] transition hover:border-indigo-300/40 hover:bg-white/[0.04]">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="h-4 w-4 text-indigo-300" />
                      {section.name}
                    </CardTitle>
                    <Badge
                      variant={
                        status === "Complete"
                          ? "success"
                          : status === "In progress"
                            ? "warning"
                            : "outline"
                      }
                    >
                      {status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-zinc-300">{section.description}</p>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
                      <span>Status score</span>
                      <span>{Math.round(section.score)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-blue-400"
                        style={{ width: `${Math.max(0, Math.min(100, section.score))}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Quick context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-zinc-300">
            Brand: <span className="font-medium text-zinc-100">{data?.profile.brandName ?? "Unconfigured"}</span>
          </p>
          <p className="text-zinc-400">
            Last updated:{" "}
            {data?.freshness.lastUpdatedAt
              ? new Date(data.freshness.lastUpdatedAt).toLocaleString()
              : "Not available"}
          </p>
          {isLoading ? <p className="text-zinc-500">Refreshing overview...</p> : null}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Link
          href="/brain/test"
          className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm text-zinc-200 transition hover:bg-white/10"
        >
          <TestTube2 className="h-4 w-4" />
          Go to Voice Test
        </Link>
      </div>
    </div>
  );
}

function sectionStatus(score: number): "Not started" | "In progress" | "Complete" {
  if (score >= 95) return "Complete";
  if (score <= 5) return "Not started";
  return "In progress";
}

function calculateSectionScore(
  profile:
    | {
        profileCompletion: number;
        voiceCompletion: number;
        rulesCompletion: number;
        productsCompletion: number;
        complianceCompletion: number;
      }
    | undefined,
  section: "overview" | "analyzer" | "documents",
  documentsCount = 0,
) {
  if (!profile) return 0;
  if (section === "overview") {
    return (
      profile.profileCompletion +
      profile.voiceCompletion +
      profile.rulesCompletion +
      profile.productsCompletion +
      profile.complianceCompletion
    ) / 5;
  }
  if (section === "documents") {
    if (documentsCount <= 0) return 0;
    return Math.min(100, 30 + documentsCount * 20);
  }
  // Store analyzer not implemented yet; infer as not started unless core profile has meaningful setup.
  return profile.profileCompletion > 40 ? 20 : 0;
}
