"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronRight, Loader2, RefreshCcw, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";
import { normalizeFullAnalysis, type AnalysisData } from "@/lib/brain/analyze-store-normalize";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ProfilePayload = {
  brandName: string | null;
  tagline: string | null;
  websiteUrl: string | null;
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

type CrawledPageRow = {
  url: string;
  label?: string;
  status: "success" | "failed";
  error?: string;
  chars?: number;
  source?: "homepage" | "discovered" | "fallback";
  contentLength?: number;
};

type AnalyzerResult = {
  analysisData: AnalysisData;
  crawledPages: CrawledPageRow[];
  pagesAttempted?: number;
  pagesSuccessful?: number;
  rawSnippet?: string;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
};

const PROGRESS_STEPS = [
  { id: "scrape", label: "Crawling homepage..." },
  { id: "identity", label: "Analyzing brand identity..." },
  { id: "voice", label: "Extracting brand voice..." },
  { id: "done", label: "Complete!" },
] as const;

type StepId = (typeof PROGRESS_STEPS)[number]["id"];

const STORAGE_KEY = "brain-analyzer-session-v1";

type PersistedSession = {
  v: 1;
  analysisResult: AnalyzerResult;
  stepPhase: Record<StepId, "pending" | "running" | "complete" | "error">;
  expandedPages: boolean;
  autoApplySuccess: boolean;
  createdIds?: { rules: string[]; ctas: string[]; phrases: string[] };
};

const COMPLETE_PHASE: Record<StepId, "complete"> = {
  scrape: "complete",
  identity: "complete",
  voice: "complete",
  done: "complete",
};

function readPersistedSession(): PersistedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedSession;
    if (data?.v !== 1 || !data.analysisResult?.analysisData) return null;
    return data;
  } catch {
    return null;
  }
}

function writePersistedSession(session: PersistedSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (!session) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // quota / private mode
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const { data: profileData, mutate: mutateProfile } = useSWR<BrandProfileResponse>(
    "/api/brain/profile",
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnMount: true,
      dedupingInterval: 0,
    },
  );
  const [hydrated, setHydrated] = useState(false);
  const [storeUrl, setStoreUrl] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AnalyzerResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoApplySuccess, setAutoApplySuccess] = useState(false);
  const [createdIds, setCreatedIds] = useState<{ rules: string[]; ctas: string[]; phrases: string[] } | null>(null);
  const [reverting, setReverting] = useState(false);
  const [stepPhase, setStepPhase] = useState<Record<StepId, "pending" | "running" | "complete" | "error">>({
    scrape: "pending",
    identity: "pending",
    voice: "pending",
    done: "pending",
  });
  const [expandedPages, setExpandedPages] = useState(false);
  const [debugSnippet, setDebugSnippet] = useState<string | null>(null);
  const userEditedUrlRef = useRef(false);
  useLayoutEffect(() => {
    const saved = readPersistedSession();
    if (saved) {
      setAnalysisResult(saved.analysisResult);
      setStepPhase(saved.stepPhase ?? COMPLETE_PHASE);
      setExpandedPages(saved.expandedPages);
      setAutoApplySuccess(saved.autoApplySuccess ?? false);
      setCreatedIds(saved.createdIds ?? null);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!profileData?.profile || isAnalyzing) return;
    if (userEditedUrlRef.current) return;
    const p = profileData.profile;
    const fromProfile = (p.websiteUrl?.trim() || p.shopifyUrl?.trim() || "").trim();
    if (fromProfile) setStoreUrl(fromProfile);
  }, [profileData?.profile, isAnalyzing]);

  useEffect(() => {
    if (!hydrated) return;
    if (!analysisResult) {
      writePersistedSession(null);
      return;
    }
    writePersistedSession({
      v: 1,
      analysisResult,
      stepPhase,
      expandedPages,
      autoApplySuccess,
      createdIds: createdIds ?? undefined,
    });
  }, [hydrated, analysisResult, stepPhase, expandedPages, autoApplySuccess, createdIds]);

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

  function clearSavedSession() {
    userEditedUrlRef.current = false;
    writePersistedSession(null);
    setAnalysisResult(null);
    setAutoApplySuccess(false);
    setCreatedIds(null);
    setError(null);
    setDebugSnippet(null);
    setExpandedPages(false);
    setStepPhase({
      scrape: "pending",
      identity: "pending",
      voice: "pending",
      done: "pending",
    });
  }

  async function analyzeStore() {
    if (!storeUrl.trim() || isAnalyzing) return;
    setError(null);
    setAutoApplySuccess(false);
    setCreatedIds(null);
    setAnalysisResult(null);
    writePersistedSession(null);
    setDebugSnippet(null);
    setExpandedPages(false);
    setIsAnalyzing(true);
    setStepPhase({
      scrape: "pending",
      identity: "pending",
      voice: "pending",
      done: "pending",
    });

    try {
      setStepPhase((p) => ({ ...p, scrape: "running" }));
      const scrapeRes = await fetchWithTimeout(
        "/api/brain/analyze-store/scrape",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: storeUrl.trim() }),
        },
        30000,
      );
      const scrapeJson = (await scrapeRes.json().catch(() => ({}))) as {
        content?: string;
        pageUrl?: string;
        error?: string;
        step?: string;
      };
      if (!scrapeRes.ok || !scrapeJson.content) {
        const msg = `[${scrapeJson.step ?? "scrape"}] ${scrapeJson.error || "Homepage scrape failed."}`;
        setStepPhase((p) => ({ ...p, scrape: "error" }));
        setError(msg);
        return;
      }
      setStepPhase((p) => ({ ...p, scrape: "complete", identity: "running" }));

      await delay(2000);

      const identityRes = await fetchWithTimeout(
        "/api/brain/analyze-store/extract-identity",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: scrapeJson.content }),
        },
        30000,
      );
      const identityJson = (await identityRes.json().catch(() => ({}))) as {
        analysisData?: Partial<AnalysisData>;
        error?: string;
        step?: string;
        rawSnippet?: string;
      };
      if (!identityRes.ok) {
        setStepPhase((p) => ({ ...p, identity: "error" }));
        setError(
          `[${identityJson.step ?? "extract_identity"}] ${identityJson.error || "Identity extraction failed."}`,
        );
        if (identityJson.rawSnippet) setDebugSnippet(identityJson.rawSnippet);
        return;
      }

      setStepPhase((p) => ({ ...p, identity: "complete", voice: "running" }));

      await delay(2000);

      const voiceRes = await fetchWithTimeout(
        "/api/brain/analyze-store/extract-voice",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: scrapeJson.content }),
        },
        30000,
      );
      const voiceJson = (await voiceRes.json().catch(() => ({}))) as {
        analysisData?: Partial<AnalysisData>;
        error?: string;
        step?: string;
        rawSnippet?: string;
      };
      if (!voiceRes.ok) {
        setStepPhase((p) => ({ ...p, voice: "error" }));
        setError(`[${voiceJson.step ?? "extract_voice"}] ${voiceJson.error || "Voice extraction failed."}`);
        if (voiceJson.rawSnippet) setDebugSnippet(voiceJson.rawSnippet);
        return;
      }

      const merged = normalizeFullAnalysis({
        ...(identityJson.analysisData ?? {}),
        ...(voiceJson.analysisData ?? {}),
      });

      const applyRes = await fetch("/api/brain/analyze-store/auto-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisData: merged,
          analyzedUrl: scrapeJson.pageUrl ?? normalizeUrl(storeUrl.trim()),
        }),
      });
      const applyJson = (await applyRes.json().catch(() => ({}))) as {
        success?: boolean;
        createdIds?: { rules?: string[]; ctas?: string[]; phrases?: string[] };
        error?: string;
      };
      if (!applyRes.ok) {
        setError(applyJson.error || "Saved analysis to view, but auto-apply to Brand Profile failed.");
        setAutoApplySuccess(false);
        setCreatedIds(null);
      } else {
        setAutoApplySuccess(true);
        setCreatedIds({
          rules: applyJson.createdIds?.rules ?? [],
          ctas: applyJson.createdIds?.ctas ?? [],
          phrases: applyJson.createdIds?.phrases ?? [],
        });
        const canonicalUrl = scrapeJson.pageUrl ?? normalizeUrl(storeUrl.trim());
        userEditedUrlRef.current = false;
        setStoreUrl(canonicalUrl);
        void mutateProfile();
      }

      const crawledPages: CrawledPageRow[] = [
        {
          url: scrapeJson.pageUrl ?? normalizeUrl(storeUrl),
          label: "Homepage",
          status: "success",
          chars: scrapeJson.content.length,
          contentLength: scrapeJson.content.length,
          source: "homepage",
        },
      ];

      setStepPhase({ scrape: "complete", identity: "complete", voice: "complete", done: "complete" });
      setAnalysisResult({
        analysisData: merged,
        crawledPages,
        pagesAttempted: 1,
        pagesSuccessful: 1,
      });
    } catch (analyzeError) {
      if (analyzeError instanceof DOMException && analyzeError.name === "AbortError") {
        setError("A request timed out. Check your connection and try again.");
      } else {
        setError(analyzeError instanceof Error ? analyzeError.message : "Analyzer failed.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function revertAutoApply() {
    if (!createdIds || reverting) return;
    const hasIds =
      createdIds.rules.length + createdIds.ctas.length + createdIds.phrases.length > 0;
    if (!hasIds) {
      setAutoApplySuccess(false);
      return;
    }
    setReverting(true);
    setError(null);
    try {
      const res = await fetch("/api/brain/analyze-store/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleIds: createdIds.rules,
          ctaIds: createdIds.ctas,
          phraseIds: createdIds.phrases,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Revert failed");
      setCreatedIds(null);
      setAutoApplySuccess(false);
      void mutateProfile();
    } catch (revertError) {
      setError(revertError instanceof Error ? revertError.message : "Revert failed.");
    } finally {
      setReverting(false);
    }
  }

  const analysis: Partial<AnalysisData> = analysisResult?.analysisData ?? {};
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
            {profileData?.profile?.websiteUrl?.trim() || profileData?.profile?.shopifyUrl?.trim()
              ? "URL loaded from your latest Brand Profile (Website or Shopify)."
              : "Enter your store URL to start analysis."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              value={storeUrl}
              onChange={(event) => {
                userEditedUrlRef.current = true;
                setStoreUrl(event.target.value);
              }}
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
          Analysis runs automatically save to your Brand Profile (including suggested rules, CTAs, and phrases).
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
          {PROGRESS_STEPS.map((step) => {
            const phase = stepPhase[step.id];
            const badgeVariant =
              phase === "complete"
                ? "success"
                : phase === "running"
                  ? "warning"
                  : phase === "error"
                    ? "destructive"
                    : "outline";
            return (
              <div key={step.id} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-100">{step.label}</p>
                  <Badge variant={badgeVariant}>{phase}</Badge>
                </div>
              </div>
            );
          })}
          <div className="h-2 rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-indigo-400 to-orange-300 transition-all"
              style={{
                width: `${Math.round(
                  (PROGRESS_STEPS.filter((s) => stepPhase[s.id] === "complete").length /
                    PROGRESS_STEPS.length) *
                    100,
                )}%`,
              }}
            />
          </div>
          {isAnalyzing ? (
            <p className="text-sm text-zinc-300">
              Running analysis in three quick steps (each server call stays within Vercel&apos;s limits).
            </p>
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
          {autoApplySuccess ? (
            <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
              Brand Profile updated with extracted data.{" "}
              <Link href="/brain/profile" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
                Open Brand Profile <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          ) : null}

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
            <Button
              variant="outline"
              onClick={() => void analyzeStore()}
              disabled={isAnalyzing || !storeUrl.trim()}
            >
              <RefreshCcw className="h-4 w-4" />
              Re-analyze
            </Button>
            {autoApplySuccess &&
            createdIds &&
            createdIds.rules.length + createdIds.ctas.length + createdIds.phrases.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void revertAutoApply()}
                disabled={reverting}
                className="text-zinc-300"
              >
                {reverting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Undo added rules / CTAs / phrases
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => clearSavedSession()} className="text-zinc-400">
              <Trash2 className="h-4 w-4" />
              Clear results
            </Button>
          </div>
          {debugSnippet ? (
            <details className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <summary className="cursor-pointer text-xs text-zinc-300">Model response snippet</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-zinc-400">
                {debugSnippet}
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
