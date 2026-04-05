"use client";

import Link from "next/link";
import useSWR from "swr";
import { Brain, ChevronRight, FileText, Loader2, Mic2, Shield, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

type ProfilePayload = {
  brandName: string | null;
  tagline: string | null;
  industry: string | null;
  niche: string | null;
  brandStory: string | null;
  usp: string | null;
  missionStatement: string | null;
  websiteUrl: string | null;
  shopifyUrl: string | null;
  targetDemographics: string | null;
  targetPsychographics: string | null;
  audiencePainPoints: string | null;
  audienceDesires: string | null;
  voiceDescription: string | null;
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
  lastStoreAnalysis: string | null;
};

type RuleRow = { id: string; rule: string; type: string; priority: string };
type CtaRow = { id: string; text: string };
type PhraseRow = { id: string; phrase: string; type: string };
type DocRow = {
  id: string;
  fileName: string;
  fileType: string;
  status: string;
  summary: string | null;
};

type ProfileResponse = {
  profile: ProfilePayload;
  rules: RuleRow[];
  ctas: CtaRow[];
  phrases: PhraseRow[];
};

type DocsResponse = {
  documents: DocRow[];
  stats: { totalDocuments: number; completedAnalyses: number };
};

function MiniBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div>
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span>{v}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-white/10">
        <div className="h-1.5 rounded-full bg-violet-400/80" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export default function MyBrainLearnedPage() {
  const { data: profileData, isLoading: profileLoading } = useSWR<ProfileResponse>("/api/brain/profile", fetcher);
  const { data: docsData, isLoading: docsLoading } = useSWR<DocsResponse>("/api/brain/documents", fetcher);

  const p = profileData?.profile;
  const rules = profileData?.rules ?? [];
  const ctas = profileData?.ctas ?? [];
  const phrases = profileData?.phrases ?? [];
  const docs = docsData?.documents ?? [];

  const loading = profileLoading || docsLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-100">
            <Brain className="h-7 w-7 text-violet-300" />
            What Worklin learned
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Everything stored in <strong className="text-zinc-200">My Brain</strong> — brand profile, voice, rules,
            CTAs, phrases, and documents the agent has processed.
          </p>
        </div>
        <Link
          href="/brain/profile"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm font-medium text-slate-100 transition-colors hover:bg-white/10"
        >
          Edit Brand Profile <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {loading && !profileData ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : null}

      <Card className="border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-amber-300" />
            Brand snapshot
          </CardTitle>
          <CardDescription>Core fields Worklin uses when writing for you.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs text-zinc-500">Brand</p>
            <p className="text-sm font-medium text-zinc-100">{p?.brandName?.trim() || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Industry / niche</p>
            <p className="text-sm text-zinc-200">
              {(p?.industry || "—") + " · " + (p?.niche || "—")}
            </p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs text-zinc-500">Tagline</p>
            <p className="text-sm text-zinc-200">{p?.tagline?.trim() || "—"}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs text-zinc-500">Voice in plain words</p>
            <p className="text-sm leading-relaxed text-zinc-200">{p?.voiceDescription?.trim() || "—"}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs text-zinc-500">URLs</p>
            <p className="text-sm text-zinc-300">
              Site: {p?.websiteUrl || "—"} · Shopify: {p?.shopifyUrl || "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mic2 className="h-5 w-5 text-indigo-300" />
            Voice sliders
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <MiniBar label="Formal ↔ Casual" value={p?.voiceFormalCasual ?? 50} />
          <MiniBar label="Serious ↔ Playful" value={p?.voiceSeriousPlayful ?? 50} />
          <MiniBar label="Reserved ↔ Enthusiastic" value={p?.voiceReservedEnthusiastic ?? 50} />
          <MiniBar label="Technical ↔ Simple" value={p?.voiceTechnicalSimple ?? 50} />
          <MiniBar label="Authoritative ↔ Approachable" value={p?.voiceAuthoritativeApproachable ?? 50} />
          <MiniBar label="Minimal ↔ Descriptive" value={p?.voiceMinimalDescriptive ?? 50} />
          <MiniBar label="Luxury ↔ Accessible" value={p?.voiceLuxuryAccessible ?? 50} />
          <MiniBar label="Edgy ↔ Safe" value={p?.voiceEdgySafe ?? 50} />
          <MiniBar label="Emotional ↔ Rational" value={p?.voiceEmotionalRational ?? 50} />
          <MiniBar label="Trendy ↔ Timeless" value={p?.voiceTrendyTimeless ?? 50} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-emerald-300" />
              Rules ({rules.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {rules.length ? (
              rules.map((r) => (
                <div key={r.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <Badge variant={r.type === "do" ? "success" : "destructive"} className="mb-1 text-[10px]">
                    {r.type}
                  </Badge>
                  <p className="text-zinc-200">{r.rule}</p>
                </div>
              ))
            ) : (
              <p className="text-zinc-500">No rules yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10">
          <CardHeader>
            <CardTitle className="text-base">CTAs ({ctas.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {ctas.length ? (
              ctas.map((c) => (
                <span
                  key={c.id}
                  className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-zinc-200"
                >
                  {c.text}
                </span>
              ))
            ) : (
              <p className="text-sm text-zinc-500">None saved.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10">
        <CardHeader>
          <CardTitle className="text-base">Phrases ({phrases.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs text-emerald-400/90">Preferred</p>
            <div className="flex flex-wrap gap-2">
              {phrases.filter((x) => x.type === "preferred").length ? (
                phrases
                  .filter((x) => x.type === "preferred")
                  .map((x) => (
                    <span
                      key={x.id}
                      className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-100"
                    >
                      {x.phrase}
                    </span>
                  ))
              ) : (
                <span className="text-xs text-zinc-500">—</span>
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs text-red-400/90">Banned</p>
            <div className="flex flex-wrap gap-2">
              {phrases.filter((x) => x.type === "banned").length ? (
                phrases
                  .filter((x) => x.type === "banned")
                  .map((x) => (
                    <span
                      key={x.id}
                      className="rounded-full border border-red-400/25 bg-red-400/10 px-2 py-1 text-xs text-red-100"
                    >
                      {x.phrase}
                    </span>
                  ))
              ) : (
                <span className="text-xs text-zinc-500">—</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-sky-300" />
            Documents ({docs.length})
          </CardTitle>
          <CardDescription>Files Worklin has ingested from chat or the Documents page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {docs.length ? (
            docs.map((d) => (
              <div key={d.id} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-100">{d.fileName}</p>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {d.fileType}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{d.summary || "No summary yet."}</p>
                <p className="mt-1 text-[11px] text-zinc-500">Status: {d.status}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-zinc-500">No documents uploaded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
