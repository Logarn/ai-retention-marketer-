"use client";

import Link from "next/link";
import { type ComponentType, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  Beaker,
  Copy,
  FilePenLine,
  Lightbulb,
  Loader2,
  MailCheck,
  MailOpen,
  PartyPopper,
  RefreshCcw,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Sun,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
};

type ScenarioOption = {
  key: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

const SCENARIOS: ScenarioOption[] = [
  {
    key: "Welcome Email (new subscriber)",
    label: "Welcome Email",
    description: "new subscriber",
    icon: MailCheck,
  },
  {
    key: "Post-Purchase (just bought something)",
    label: "Post-Purchase",
    description: "just bought something",
    icon: ShoppingCart,
  },
  {
    key: "Win-Back (haven't purchased in 90 days)",
    label: "Win-Back",
    description: "inactive 90 days",
    icon: RefreshCcw,
  },
  {
    key: "Product Launch (new product announcement)",
    label: "Product Launch",
    description: "new product announcement",
    icon: Sparkles,
  },
  {
    key: "VIP Exclusive (loyal customer reward)",
    label: "VIP Exclusive",
    description: "loyal customer reward",
    icon: Star,
  },
  {
    key: "Seasonal Sale (holiday/seasonal promotion)",
    label: "Seasonal Sale",
    description: "holiday promotion",
    icon: Sun,
  },
  {
    key: "Re-Engagement (inactive subscriber)",
    label: "Re-Engagement",
    description: "inactive subscriber",
    icon: MailOpen,
  },
  {
    key: "Abandoned Cart (left items in cart)",
    label: "Abandoned Cart",
    description: "left items in cart",
    icon: Store,
  },
];

type VoiceTestResponse = {
  brief: {
    campaignGoal: string;
    targetSegment: string;
    strategyRationale: string;
    subjectLines: string[];
    messagingPoints: string[];
    recommendedCTA: string;
    expectedEmotion: string;
  };
  copy: {
    subjectLine: string;
    previewText: string;
    emailBody: string;
    ctaText: string;
    signOff: string;
  };
  brandDataUsed?: {
    profileFieldsUsed: string[];
    presetVoiceDimensions: string[];
    customVoiceDimensions: string[];
    doRules: string[];
    dontRules: string[];
    preferredCTAs: string[];
    preferredPhrases: string[];
    bannedPhrases: string[];
  };
};

type BrainProfileResponse = {
  profile: {
    brandName: string | null;
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
  };
};

const LOADING_STEPS = [
  "Analyzing your brand voice...",
  "Crafting strategy...",
  "Writing copy...",
];

export default function BrainVoiceTestPage() {
  const { data: profileData } = useSWR<BrainProfileResponse>("/api/brain/profile", fetcher);
  const [scenario, setScenario] = useState<string>("");
  const [context, setContext] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [result, setResult] = useState<VoiceTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedLine, setCopiedLine] = useState<number | null>(null);

  useEffect(() => {
    if (!isGenerating) return;
    const interval = window.setInterval(() => {
      setLoadingStepIndex((current) => (current + 1) % LOADING_STEPS.length);
    }, 1400);
    return () => window.clearInterval(interval);
  }, [isGenerating]);

  const isProfileIncomplete = useMemo(() => {
    const profile = profileData?.profile;
    if (!profile) return false;
    const required = [
      profile.brandName,
      profile.industry,
      profile.niche,
      profile.brandStory,
      profile.usp,
      profile.missionStatement,
      profile.targetDemographics,
      profile.targetPsychographics,
      profile.audiencePainPoints,
      profile.audienceDesires,
      profile.voiceDescription,
    ];
    const filled = required.filter((item) => (item ?? "").trim().length > 0).length;
    return filled < 7;
  }, [profileData]);

  async function generate() {
    if (!scenario || isGenerating) return;
    setError(null);
    setIsGenerating(true);
    setLoadingStepIndex(0);
    try {
      const response = await fetch("/api/brain/voice-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario,
          context: context.trim() ? context.trim() : undefined,
        }),
      });

      const json = (await response.json().catch(() => ({}))) as VoiceTestResponse & { error?: string };
      if (!response.ok) throw new Error(json.error || "Failed to generate voice test output.");
      setResult(json);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Failed to generate output.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function copySubjectLine(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLine(index);
      window.setTimeout(() => setCopiedLine(null), 1200);
    } catch {
      setCopiedLine(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-100">
          <Beaker className="h-5 w-5 text-indigo-300" />
          Voice Test
        </h1>
        <p className="text-sm text-zinc-400">Test if the AI truly understands your brand voice.</p>
      </div>

      {isProfileIncomplete ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-200" />
          <p className="text-sm text-amber-100">
            Your Brand Profile is incomplete. Fill it in for better results.{" "}
            <Link href="/brain/profile" className="font-medium underline underline-offset-2">
              Go to Brand Profile
            </Link>
          </p>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Choose a scenario</CardTitle>
          <CardDescription>Select the campaign context to test voice + strategy output.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SCENARIOS.map((item) => {
              const Icon = item.icon;
              const selected = scenario === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setScenario(item.key)}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left transition-colors",
                    selected
                      ? "border-orange-300/60 bg-orange-300/12 ring-1 ring-orange-300/40"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", selected ? "text-orange-200" : "text-zinc-300")} />
                    <p className={cn("text-sm font-medium", selected ? "text-orange-100" : "text-zinc-100")}>
                      {item.label}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">{item.description}</p>
                </button>
              );
            })}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Add context (optional)</label>
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              rows={3}
              placeholder="e.g., We're launching a new vitamin C serum for $45, targeting existing customers who bought skincare before"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void generate()} disabled={isGenerating || !scenario}>
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PartyPopper className="h-4 w-4" />}
              Generate
            </Button>
            {result ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => void generate()}
                  disabled={isGenerating}
                >
                  <RefreshCcw className="h-4 w-4" />
                  Regenerate
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setScenario("");
                    setContext("");
                    setResult(null);
                    setError(null);
                  }}
                >
                  Try Different Scenario
                </Button>
              </>
            ) : null}
          </div>

          {isGenerating ? (
            <div className="rounded-xl border border-indigo-300/20 bg-indigo-300/10 px-3 py-2">
              <p className="animate-pulse text-sm text-indigo-100">{LOADING_STEPS[loadingStepIndex]}</p>
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-200" />
                Email Brief
              </CardTitle>
              <CardDescription>Strategy output for the selected scenario.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-zinc-400">Campaign Goal</p>
                <p className="text-sm font-semibold text-zinc-100">{result.brief.campaignGoal}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Target Segment</p>
                <p className="text-sm text-zinc-200">{result.brief.targetSegment}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs text-zinc-400">Strategy Rationale</p>
                <p className="mt-1 text-sm text-zinc-200">&ldquo;{result.brief.strategyRationale}&rdquo;</p>
              </div>

              <div>
                <p className="text-xs text-zinc-400">Subject Line Options</p>
                <ol className="mt-2 space-y-2">
                  {result.brief.subjectLines.map((line, index) => (
                    <li key={`${line}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                      <span className="text-sm text-zinc-100">
                        {index + 1}. {line}
                      </span>
                      <button
                        type="button"
                        onClick={() => void copySubjectLine(line, index)}
                        className="inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-zinc-100"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedLine === index ? "Copied" : "Copy"}
                      </button>
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <p className="text-xs text-zinc-400">Key Messaging Points</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-200">
                  {result.brief.messagingPoints.map((point, index) => (
                    <li key={`${point}-${index}`}>{point}</li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-400">Recommended CTA</span>
                <Badge variant="secondary">{result.brief.recommendedCTA}</Badge>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Expected Emotion</p>
                <p className="text-sm text-zinc-200">{result.brief.expectedEmotion}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FilePenLine className="h-4 w-4 text-blue-200" />
                Email Copy
              </CardTitle>
              <CardDescription>Execution-ready copy draft.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-zinc-400">Subject line</p>
                <p className="text-base font-semibold text-zinc-100">{result.copy.subjectLine}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Preview text</p>
                <p className="text-sm text-zinc-300">{result.copy.previewText}</p>
              </div>

              <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 text-zinc-900 shadow-inner">
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Email Preview</p>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6">{result.copy.emailBody}</p>
                  <div>
                    <button
                      type="button"
                      className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
                    >
                      {result.copy.ctaText}
                    </button>
                  </div>
                  <p className="text-sm text-zinc-700">{result.copy.signOff}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {result?.brandDataUsed ? (
        <details className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-zinc-100">Brand data used</summary>
          <div className="mt-3 grid gap-3 text-xs text-zinc-300 md:grid-cols-2">
            <DataList title="Profile fields" items={result.brandDataUsed.profileFieldsUsed} />
            <DataList title="Preset voice dimensions" items={result.brandDataUsed.presetVoiceDimensions} />
            <DataList title="Custom voice dimensions" items={result.brandDataUsed.customVoiceDimensions} emptyLabel="None" />
            <DataList title="Do rules" items={result.brandDataUsed.doRules} emptyLabel="None" />
            <DataList title="Don't rules" items={result.brandDataUsed.dontRules} emptyLabel="None" />
            <DataList title="Preferred CTAs" items={result.brandDataUsed.preferredCTAs} emptyLabel="None" />
            <DataList title="Preferred phrases" items={result.brandDataUsed.preferredPhrases} emptyLabel="None" />
            <DataList title="Banned phrases" items={result.brandDataUsed.bannedPhrases} emptyLabel="None" />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function DataList({ title, items, emptyLabel = "Not provided" }: { title: string; items: string[]; emptyLabel?: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">{title}</p>
      {items.length ? (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={`${title}-${item}`} className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-zinc-500">{emptyLabel}</p>
      )}
    </div>
  );
}
