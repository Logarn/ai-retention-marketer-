"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CheckCircle2, ChevronRight, Loader2, RefreshCcw, Search, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ProfilePayload = {
  brandName: string | null;
  tagline: string | null;
  industry: string | null;
  niche: string | null;
  brandStory: string | null;
  usp: string | null;
  missionStatement: string | null;
  targetDemographics: string | null;
  targetPsychographics: string | null;
  audiencePainPoints: string | null;
  audienceDesires: string | null;
  voiceDescription: string | null;
  shopifyUrl: string | null;
  voiceFormalCasual: number;
  voiceSeriousPlayful: number;
  voiceReservedEnthusiastic: number;
  voiceTechnicalSimple: number;
  voiceAuthoritativeApproachable: number;
  voiceMinimalDescriptive: number;
  voiceLuxuryAccessible: number;
  voiceEdgySafe: number;
  voiceEmotionalRational: number;
  voiceTrendyTimeless: number;
  greetingStyle: string | null;
  signOffStyle: string | null;
  emojiUsage: string | null;
  preferredLength: string | null;
  discountPhilosophy: string | null;
};

type BrandProfileResponse = {
  profile: ProfilePayload;
};

type PageResult = {
  url: string;
  status: "success" | "failed";
  source: "homepage" | "discovered" | "fallback";
  contentLength: number;
  error?: string;
};

type AnalyzerResponse = {
  analysisData: Record<string, unknown>;
  crawledPages: Array<{
    url: string;
    label?: string;
    status: "success" | "failed";
    error?: string;
    chars?: number;
    source?: "homepage" | "discovered" | "fallback";
    contentLength?: number;
  }>;
  pagesAttempted?: number;
  pagesSuccessful?: number;
  normalizedUrl?: string;
  source?: string;
  error?: string;
  step?: string;
  detail?: string;
  rawSnippet?: string;
  totalCharsAnalyzed?: number;
};

type ApplySection =
  | "identity"
  | "audience"
  | "voice"
  | "rules"
  | "ctas"
  | "phrases"
  | "emailPrefs";

const APPLYABLE_SECTIONS: Array<{ key: ApplySection; label: string; description: string }> = [
  { key: "identity", label: "Core Identity", description: "Brand name, niche, story, mission, USP" },
  { key: "audience", label: "Target Audience", description: "Demographics, psychographics, pain points, desires" },
  { key: "voice", label: "Brand Voice", description: "10 voice dimensions and voice description" },
  { key: "rules", label: "Messaging Rules", description: "Do's and don'ts from extracted guidance" },
  { key: "ctas", label: "CTAs", description: "Suggested call-to-action phrases" },
  { key: "phrases", label: "Phrases", description: "Preferred and banned phrase suggestions" },
  { key: "emailPrefs", label: "Email Preferences", description: "Greeting, sign-off, emoji and cadence defaults" },
];

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
};

const PROGRESS_STEPS = [
  "Connecting to store...",
  "Crawling homepage...",
  "Finding key pages...",
  "Crawling key pages...",
  "Analyzing brand elements...",
  "Extracting brand voice...",
  "Complete!",
];

function scalar(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function list(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function normalizeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function ComparisonRow({
  label,
  current,
  extracted,
}: {
  label: string;
  current?: string | null;
  extracted?: string | null;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-1 text-xs text-zinc-500">Current: {current?.trim() ? current : "Not set"}</p>
      <p className="mt-1 text-sm text-zinc-100">Extracted: {extracted?.trim() ? extracted : "Not detected"}</p>
    </div>
  );
}

function MiniVoiceMeter({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span>{safeValue}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white/10">
        <div className="h-2 rounded-full bg-indigo-300" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

export default function BrainAnalyzerPage() {
  const { data: profileData } = useSWR<BrandProfileResponse>("/api/brain/profile", fetcher);
  const [storeUrl, setStoreUrl] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AnalyzerResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [progressIndex, setProgressIndex] = useState(0);
  const [expandedPages, setExpandedPages] = useState(false);
  const [selectedSections, setSelectedSections] = useState<Record<ApplySection, boolean>>({
    identity: true,
    audience: true,
    voice: true,
    rules: true,
    ctas: true,
    phrases: true,
    emailPrefs: true,
  });

  useEffect(() => {
    if (!profileData?.profile.shopifyUrl) return;
    setStoreUrl((current) => current || profileData.profile.shopifyUrl || "");
  }, [profileData?.profile.shopifyUrl]);

  useEffect(() => {
    if (!isAnalyzing) return;
    setProgressIndex(0);
    const timer = window.setInterval(() => {
      setProgressIndex((current) => Math.min(PROGRESS_STEPS.length - 1, current + 1));
    }, 2200);
    return () => window.clearInterval(timer);
  }, [isAnalyzing]);

  const selectedSectionList = useMemo(
    () =>
      APPLYABLE_SECTIONS.filter((section) => selectedSections[section.key]).map(
        (section) => section.key,
      ),
    [selectedSections],
  );

  async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      return response;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function analyzeStore() {
    if (!storeUrl.trim() || isAnalyzing) return;
    setError(null);
    setApplyMessage(null);
    setAnalysisResult(null);
    setExpandedPages(false);
    setIsAnalyzing(true);

    try {
      const response = await fetchWithTimeout(
        "/api/brain/analyze-store",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: storeUrl.trim() }),
        },
        60000,
      );
      const json = (await response.json().catch(() => ({}))) as AnalyzerResponse;
      if (!response.ok) {
        const stepLabel = json.step ? `[${json.step}] ` : "";
        const detail = json.detail ? ` (${json.detail})` : "";
        throw new Error(`${stepLabel}${json.error || "Analyzer failed."}${detail}`);
      }
      setAnalysisResult(json);
      setProgressIndex(PROGRESS_STEPS.length - 1);
    } catch (analyzeError) {
      if (analyzeError instanceof DOMException && analyzeError.name === "AbortError") {
        setError("Analyzer timed out after 60 seconds. Try again or use a shorter URL.");
      } else {
        setError(analyzeError instanceof Error ? analyzeError.message : "Analyzer failed.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function applySelectedSections() {
    if (!analysisResult || !selectedSectionList.length || isApplying) return;
    setError(null);
    setApplyMessage(null);
    setIsApplying(true);

    try {
      const response = await fetch("/api/brain/analyze-store/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisData: analysisResult.analysisData,
          sections: selectedSectionList,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string; summary?: string };
      if (!response.ok) throw new Error(json.error || "Apply failed.");
      setApplyMessage(json.summary || "Selected sections applied to Brand Profile.");
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Apply failed.");
    } finally {
      setIsApplying(false);
    }
  }

  const analysis = analysisResult?.analysisData ?? {};
  const pages = analysisResult?.crawledPages ?? [];
  const successfulPages = pages.filter((page) => page.status === "success");
  const failedPages = pages.filter((page) => page.status === "failed");
  const urlForAnalysis = normalizeUrl(storeUrl);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Store Analyzer</h1>
        <p className="text-sm text-zinc-400">Crawl your store and let AI extract your brand DNA.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Analyze Store</CardTitle>
          <CardDescription>
            {profileData?.profile.shopifyUrl
              ? "Shopify URL auto-loaded from your Brand Profile."
              : "Enter your store URL to start analysis."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              value={storeUrl}
              onChange={(event) => setStoreUrl(event.target.value)}
              placeholder="https://your-store.myshopify.com"
            />
            <Button onClick={() => void analyzeStore()} disabled={isAnalyzing || !storeUrl.trim()}>
              {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {isAnalyzing ? "Analyzing Store..." : "Analyze Store"}
            </Button>
          </div>
          <p className="text-xs text-zinc-500">Or enter any URL to analyze.</p>
          {urlForAnalysis ? (
            <p className="text-xs text-zinc-400">
              Normalized URL: <span className="text-zinc-200">{urlForAnalysis}</span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      {profileData?.profile.brandName || profileData?.profile.brandStory ? (
        <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          This will update your existing Brand Profile. You can select which sections to overwrite.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-300" />
            Crawl Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {PROGRESS_STEPS.map((step, index) => {
            const status =
              index < progressIndex ? "complete" : index === progressIndex && (isAnalyzing || analysisResult) ? "running" : "pending";
            return (
              <div key={step} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-100">{step}</p>
                  <Badge
                    variant={
                      status === "complete" ? "success" : status === "running" ? "warning" : "outline"
                    }
                  >
                    {status}
                  </Badge>
                </div>
              </div>
            );
          })}
          <div className="h-2 rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-indigo-400 to-orange-300 transition-all"
              style={{ width: `${Math.round(((progressIndex + 1) / PROGRESS_STEPS.length) * 100)}%` }}
            />
          </div>
          {isAnalyzing ? (
            <p className="text-sm text-zinc-300">Running analysis. This can take 15-30 seconds.</p>
          ) : null}
        </CardContent>
      </Card>

      {analysisResult ? (
        <details className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3" open={expandedPages}>
          <summary
            className="cursor-pointer text-sm font-medium text-zinc-100"
            onClick={() => setExpandedPages((value) => !value)}
          >
            Pages Crawled ({successfulPages.length} success, {failedPages.length} failed)
          </summary>
          <div className="mt-3 space-y-2">
            {pages.map((page) => (
              <div key={page.url} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-zinc-200">{page.url}</p>
                  <Badge variant={page.status === "success" ? "success" : "destructive"}>{page.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Source: {page.source ?? "n/a"} • Content length: {page.contentLength ?? page.chars ?? 0}
                </p>
                {page.error ? <p className="mt-1 text-xs text-red-300">{page.error}</p> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {analysisResult ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {APPLYABLE_SECTIONS.map((section) => (
              <label
                key={section.key}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
              >
                <input
                  type="checkbox"
                  checked={selectedSections[section.key]}
                  onChange={(event) =>
                    setSelectedSections((prev) => ({ ...prev, [section.key]: event.target.checked }))
                  }
                  className="mt-1 accent-indigo-400"
                />
                <div>
                  <p className="text-sm font-medium text-zinc-100">{section.label}</p>
                  <p className="text-xs text-zinc-400">{section.description}</p>
                </div>
              </label>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Core Identity</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <ComparisonRow label="Brand Name" current={profileData?.profile.brandName} extracted={scalar(analysis.brandName)} />
              <ComparisonRow label="Tagline" current={profileData?.profile.tagline} extracted={scalar(analysis.tagline)} />
              <ComparisonRow label="Industry" current={profileData?.profile.industry} extracted={scalar(analysis.industry)} />
              <ComparisonRow label="Niche" current={profileData?.profile.niche} extracted={scalar(analysis.niche)} />
              <ComparisonRow
                label="Brand Story"
                current={profileData?.profile.brandStory}
                extracted={scalar(analysis.brandStory)}
              />
              <ComparisonRow label="USP" current={profileData?.profile.usp} extracted={scalar(analysis.usp)} />
              <ComparisonRow
                label="Mission Statement"
                current={profileData?.profile.missionStatement}
                extracted={scalar(analysis.missionStatement)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Target Audience</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <ComparisonRow
                label="Target Demographics"
                current={profileData?.profile.targetDemographics}
                extracted={scalar(analysis.targetDemographics)}
              />
              <ComparisonRow
                label="Target Psychographics"
                current={profileData?.profile.targetPsychographics}
                extracted={scalar(analysis.targetPsychographics)}
              />
              <ComparisonRow
                label="Audience Pain Points"
                current={profileData?.profile.audiencePainPoints}
                extracted={scalar(analysis.audiencePainPoints)}
              />
              <ComparisonRow
                label="Audience Desires"
                current={profileData?.profile.audienceDesires}
                extracted={scalar(analysis.audienceDesires)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brand Voice</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <MiniVoiceMeter label="Formal↔Casual" value={Number(analysis.voiceFormalCasual ?? 50)} />
                <MiniVoiceMeter label="Serious↔Playful" value={Number(analysis.voiceSeriousPlayful ?? 50)} />
                <MiniVoiceMeter
                  label="Reserved↔Enthusiastic"
                  value={Number(analysis.voiceReservedEnthusiastic ?? 50)}
                />
                <MiniVoiceMeter label="Technical↔Simple" value={Number(analysis.voiceTechnicalSimple ?? 50)} />
                <MiniVoiceMeter
                  label="Authoritative↔Approachable"
                  value={Number(analysis.voiceAuthoritativeApproachable ?? 50)}
                />
                <MiniVoiceMeter
                  label="Minimal↔Descriptive"
                  value={Number(analysis.voiceMinimalDescriptive ?? 50)}
                />
                <MiniVoiceMeter label="Luxury↔Accessible" value={Number(analysis.voiceLuxuryAccessible ?? 50)} />
                <MiniVoiceMeter label="Edgy↔Safe" value={Number(analysis.voiceEdgySafe ?? 50)} />
                <MiniVoiceMeter
                  label="Emotional↔Rational"
                  value={Number(analysis.voiceEmotionalRational ?? 50)}
                />
                <MiniVoiceMeter label="Trendy↔Timeless" value={Number(analysis.voiceTrendyTimeless ?? 50)} />
              </div>
              <ComparisonRow
                label="Voice Description"
                current={profileData?.profile.voiceDescription}
                extracted={scalar(analysis.voiceDescription)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Messaging Rules</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs text-zinc-400">Suggested Do&apos;s</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-100">
                  {list(analysis.suggestedDos).map((item) => (
                    <li key={`do-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs text-zinc-400">Suggested Don&apos;ts</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-100">
                  {list(analysis.suggestedDonts).map((item) => (
                    <li key={`dont-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>CTAs & Phrases</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <TagSet title="Suggested CTAs" items={list(analysis.suggestedCTAs)} />
              <TagSet title="Preferred Phrases" items={list(analysis.suggestedPreferredPhrases)} />
              <TagSet title="Banned Phrases" items={list(analysis.suggestedBannedPhrases)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email Preferences</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <ComparisonRow
                label="Greeting Style"
                current={profileData?.profile.greetingStyle}
                extracted={scalar(analysis.greetingStyle)}
              />
              <ComparisonRow
                label="Sign-Off Style"
                current={profileData?.profile.signOffStyle}
                extracted={scalar(analysis.signOffStyle)}
              />
              <ComparisonRow
                label="Emoji Usage"
                current={profileData?.profile.emojiUsage}
                extracted={scalar(analysis.emojiUsage)}
              />
              <ComparisonRow
                label="Preferred Length"
                current={profileData?.profile.preferredLength}
                extracted={scalar(analysis.preferredLength)}
              />
              <ComparisonRow
                label="Discount Philosophy"
                current={profileData?.profile.discountPhilosophy}
                extracted={scalar(analysis.discountPhilosophy)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Store Insights (Info only)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs text-zinc-400">Products Summary</p>
                <p className="mt-1 text-sm text-zinc-100">{scalar(analysis.productsSummary) || "Not detected"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs text-zinc-400">Price Range</p>
                <p className="mt-1 text-sm text-zinc-100">{scalar(analysis.priceRange) || "Not detected"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs text-zinc-400">Competitive Positioning</p>
                <p className="mt-1 text-sm text-zinc-100">{scalar(analysis.competitivePositioning) || "Not detected"}</p>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void applySelectedSections()} disabled={isApplying || !selectedSectionList.length}>
              {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Apply Selected to Brand Profile
            </Button>
            <Button
              variant="outline"
              onClick={() => void analyzeStore()}
              disabled={isAnalyzing || !storeUrl.trim()}
            >
              <RefreshCcw className="h-4 w-4" />
              Re-analyze
            </Button>
          </div>

          {applyMessage ? (
            <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
              {applyMessage}{" "}
              <Link href="/brain/profile" className="inline-flex items-center gap-1 underline underline-offset-2">
                Review Brand Profile <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          ) : null}
          {analysisResult?.rawSnippet ? (
            <details className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <summary className="cursor-pointer text-xs text-zinc-300">Model response snippet</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-zinc-400">
                {analysisResult.rawSnippet}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-300/30 bg-red-300/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function TagSet({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <p className="text-xs text-zinc-400">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length ? (
          items.map((item) => (
            <span
              key={`${title}-${item}`}
              className="inline-flex items-center rounded-full border border-white/15 px-2 py-1 text-xs text-zinc-200"
            >
              {item}
            </span>
          ))
        ) : (
          <span className="text-xs text-zinc-500">No suggestions</span>
        )}
      </div>
    </div>
  );
}
