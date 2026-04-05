"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Brain, Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type ProfilePayload = {
  id: string;
  storeId: string;
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
  voiceDescription: string | null;
  greetingStyle: string | null;
  signOffStyle: string | null;
  emojiUsage: string | null;
  preferredLength: string | null;
  discountPhilosophy: string | null;
  createdAt: string;
  updatedAt: string;
};

type BrandProfileResponse = {
  profile: ProfilePayload;
  ctas: Array<{ id: string; text: string; isPreferred: boolean }>;
  phrases: Array<{ id: string; phrase: string; type: "preferred" | "banned" }>;
  rules: Array<{
    id: string;
    rule: string;
    type: "do" | "dont";
    priority: "critical" | "important" | "nice-to-have";
  }>;
  customVoiceDimensions: Array<{
    id: string;
    leftLabel: string;
    rightLabel: string;
    description: string | null;
    value: number;
  }>;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
};

type VoicePresetKey =
  | "voiceFormalCasual"
  | "voiceSeriousPlayful"
  | "voiceReservedEnthusiastic"
  | "voiceTechnicalSimple"
  | "voiceAuthoritativeApproachable"
  | "voiceMinimalDescriptive"
  | "voiceLuxuryAccessible"
  | "voiceEdgySafe"
  | "voiceEmotionalRational"
  | "voiceTrendyTimeless";

const STORE_ID = "default";

const VOICE_PRESETS: Array<{
  key: VoicePresetKey;
  left: string;
  right: string;
  description: string;
}> = [
  {
    key: "voiceFormalCasual",
    left: "Formal",
    right: "Casual",
    description: "How buttoned-up is your brand? Corporate polish vs. talking to a friend",
  },
  {
    key: "voiceSeriousPlayful",
    left: "Serious",
    right: "Playful",
    description: "Do you keep it straight-laced or crack jokes and have fun?",
  },
  {
    key: "voiceReservedEnthusiastic",
    left: "Reserved",
    right: "Enthusiastic",
    description: "Understated and calm vs. exclamation marks and high energy",
  },
  {
    key: "voiceTechnicalSimple",
    left: "Technical",
    right: "Simple",
    description: "Industry jargon and detail vs. plain language anyone gets",
  },
  {
    key: "voiceAuthoritativeApproachable",
    left: "Authoritative",
    right: "Approachable",
    description: "Expert commanding respect vs. warm and relatable peer",
  },
  {
    key: "voiceMinimalDescriptive",
    left: "Minimal",
    right: "Descriptive",
    description: "Short, punchy, less is more vs. rich detail and storytelling",
  },
  {
    key: "voiceLuxuryAccessible",
    left: "Luxury",
    right: "Accessible",
    description: "Premium, exclusive, aspirational vs. down-to-earth and for everyone",
  },
  {
    key: "voiceEdgySafe",
    left: "Edgy",
    right: "Safe",
    description: "Pushes boundaries, bold takes vs. universally inoffensive and neutral",
  },
  {
    key: "voiceEmotionalRational",
    left: "Emotional",
    right: "Rational",
    description: "Leads with feelings and stories vs. leads with facts and logic",
  },
  {
    key: "voiceTrendyTimeless",
    left: "Trendy",
    right: "Timeless",
    description: "Pop culture references and slang vs. classic language that never dates",
  },
];

function clampSlider(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

type LocalState = {
  brandName: string;
  tagline: string;
  industry: string;
  niche: string;
  websiteUrl: string;
  shopifyUrl: string;
  brandStory: string;
  usp: string;
  missionStatement: string;
  targetDemographics: string;
  targetPsychographics: string;
  audiencePainPoints: string;
  audienceDesires: string;
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
  voiceDescription: string;
  greetingStyle: string;
  signOffStyle: string;
  emojiUsage: string;
  preferredLength: string;
  discountPhilosophy: string;
};

function toLocalState(input: ProfilePayload): LocalState {
  return {
    brandName: input.brandName ?? "",
    tagline: input.tagline ?? "",
    industry: input.industry ?? "",
    niche: input.niche ?? "",
    websiteUrl: input.websiteUrl ?? "",
    shopifyUrl: input.shopifyUrl ?? "",
    brandStory: input.brandStory ?? "",
    usp: input.usp ?? "",
    missionStatement: input.missionStatement ?? "",
    targetDemographics: input.targetDemographics ?? "",
    targetPsychographics: input.targetPsychographics ?? "",
    audiencePainPoints: input.audiencePainPoints ?? "",
    audienceDesires: input.audienceDesires ?? "",
    voiceFormalCasual: input.voiceFormalCasual,
    voiceSeriousPlayful: input.voiceSeriousPlayful,
    voiceReservedEnthusiastic: input.voiceReservedEnthusiastic,
    voiceTechnicalSimple: input.voiceTechnicalSimple,
    voiceAuthoritativeApproachable: input.voiceAuthoritativeApproachable,
    voiceMinimalDescriptive: input.voiceMinimalDescriptive,
    voiceLuxuryAccessible: input.voiceLuxuryAccessible,
    voiceEdgySafe: input.voiceEdgySafe,
    voiceEmotionalRational: input.voiceEmotionalRational,
    voiceTrendyTimeless: input.voiceTrendyTimeless,
    voiceDescription: input.voiceDescription ?? "",
    greetingStyle: input.greetingStyle ?? "friendly",
    signOffStyle: input.signOffStyle ?? "warm",
    emojiUsage: input.emojiUsage ?? "sparingly",
    preferredLength: input.preferredLength ?? "medium",
    discountPhilosophy: input.discountPhilosophy ?? "strategically",
  };
}

function completionPercent(state: LocalState) {
  const checks = [
    state.brandName,
    state.tagline,
    state.industry,
    state.niche,
    state.websiteUrl,
    state.brandStory,
    state.usp,
    state.missionStatement,
    state.targetDemographics,
    state.targetPsychographics,
    state.audiencePainPoints,
    state.audienceDesires,
    state.voiceDescription,
  ];
  const total = checks.length;
  const complete = checks.filter((item) => item.trim().length > 0).length;
  return Math.round((complete / total) * 100);
}

export default function BrainProfilePage() {
  const { data, isLoading, mutate } = useSWR<BrandProfileResponse>("/api/brain/profile", fetcher);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<LocalState | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentRef = useRef<Partial<LocalState>>({});

  const ctas = data?.ctas ?? [];
  const phrases = data?.phrases ?? [];
  const rules = data?.rules ?? [];
  const customVoiceDimensions = data?.customVoiceDimensions ?? [];

  useEffect(() => {
    if (!data?.profile) return;
    setState(toLocalState(data.profile));
  }, [data?.profile]);

  function showSaved() {
    setNotice("Saved");
    window.setTimeout(() => setNotice(null), 1200);
  }

  async function saveProfilePatch(patch: Partial<LocalState>) {
    if (!state) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/brain/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: STORE_ID,
          ...patch,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(json.error || "Failed to save profile.");
      await mutate();
      showSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  function debouncedVoiceSave(next: Partial<LocalState>) {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      void saveProfilePatch(next);
    }, 500);
  }

  function debouncedAutosave(next: Partial<LocalState>) {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      const pending: Partial<LocalState> = {};
      for (const [key, value] of Object.entries(next)) {
        const typedKey = key as keyof LocalState;
        if (lastSentRef.current[typedKey] !== value) {
          pending[typedKey] = value as never;
        }
      }
      if (Object.keys(pending).length === 0) return;
      lastSentRef.current = { ...lastSentRef.current, ...pending };
      void saveProfilePatch(pending);
    }, 1000);
  }

  useEffect(() => {
    const flush = () => {
      if (!saveTimerRef.current) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (!state) return;
      // Best-effort: persist the latest local state snapshot before navigation/unload.
      void saveProfilePatch({ ...state });
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [state]);

  async function addCta(text: string) {
    if (!text.trim()) return;
    const response = await fetch("/api/brain/profile/ctas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim(), isPreferred: true }),
    });
    if (!response.ok) throw new Error("Failed to add CTA.");
    await mutate();
    showSaved();
  }

  async function deleteCta(id: string) {
    const response = await fetch(`/api/brain/profile/ctas?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Failed to delete CTA.");
    await mutate();
    showSaved();
  }

  async function addPhrase(phrase: string, type: "preferred" | "banned") {
    if (!phrase.trim()) return;
    const response = await fetch("/api/brain/profile/phrases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phrase: phrase.trim(), type }),
    });
    if (!response.ok) throw new Error("Failed to add phrase.");
    await mutate();
    showSaved();
  }

  async function deletePhrase(id: string) {
    const response = await fetch(`/api/brain/profile/phrases?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Failed to delete phrase.");
    await mutate();
    showSaved();
  }

  async function addRule(rule: string, type: "do" | "dont", priority: "critical" | "important" | "nice-to-have") {
    if (!rule.trim()) return;
    const response = await fetch("/api/brain/profile/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule: rule.trim(), type, priority }),
    });
    if (!response.ok) throw new Error("Failed to add rule.");
    await mutate();
    showSaved();
  }

  async function deleteRule(id: string) {
    const response = await fetch(`/api/brain/profile/rules?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Failed to delete rule.");
    await mutate();
    showSaved();
  }

  async function addCustomVoiceDimension(input: {
    leftLabel: string;
    rightLabel: string;
    description: string;
  }) {
    const response = await fetch("/api/brain/profile/voice-dimensions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leftLabel: input.leftLabel.trim(),
        rightLabel: input.rightLabel.trim(),
        description: input.description.trim() || null,
        value: 50,
      }),
    });
    if (!response.ok) throw new Error("Failed to add custom voice dimension.");
    await mutate();
    showSaved();
  }

  async function updateCustomVoiceDimension(id: string, value: number) {
    const response = await fetch("/api/brain/profile/voice-dimensions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, value: clampSlider(value) }),
    });
    if (!response.ok) throw new Error("Failed to update custom voice dimension.");
    await mutate();
  }

  async function deleteCustomVoiceDimension(id: string) {
    const response = await fetch(`/api/brain/profile/voice-dimensions?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Failed to delete custom voice dimension.");
    await mutate();
    showSaved();
  }

  const completeness = useMemo(() => (state ? completionPercent(state) : 0), [state]);

  if (isLoading || !state) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Brand Profile</h1>
          <p className="text-sm text-zinc-400">
            Your brand&apos;s identity. Everything the AI needs to write in your voice.
          </p>
        </div>
        <Skeleton className="h-16" />
        {Array.from({ length: 6 }).map((_, idx) => (
          <Card key={idx}>
            <CardHeader>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-72" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Brand Profile</h1>
        <p className="text-sm text-zinc-400">
          Your brand&apos;s identity. Everything the AI needs to write in your voice.
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <p className="text-sm text-zinc-300">Profile completeness: {completeness}%</p>
            <div className="mt-2 h-2 w-64 rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-blue-400"
                style={{ width: `${completeness}%` }}
              />
            </div>
          </div>
          {isSaving ? <Badge variant="warning">Saving...</Badge> : notice ? <Badge variant="success">{notice}</Badge> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-orange-300" />
            Core Identity
          </CardTitle>
          <CardDescription>
            Core identity inputs used across all Brain systems.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Brand name</label>
              <Input
                value={state.brandName}
                onChange={(event) => setState((prev) => (prev ? { ...prev, brandName: event.target.value } : prev))}
                onBlur={() => void saveProfilePatch({ brandName: state.brandName })}
                placeholder="Sauti"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Tagline</label>
              <Input
                value={state.tagline}
                onChange={(event) => setState((prev) => (prev ? { ...prev, tagline: event.target.value } : prev))}
                onBlur={() => void saveProfilePatch({ tagline: state.tagline })}
                placeholder="Your concise promise in one line."
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Industry</label>
              <Input
                value={state.industry}
                onChange={(event) => setState((prev) => (prev ? { ...prev, industry: event.target.value } : prev))}
                onBlur={() => void saveProfilePatch({ industry: state.industry })}
                placeholder="Skincare"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Niche</label>
              <Input
                value={state.niche}
                onChange={(event) => setState((prev) => (prev ? { ...prev, niche: event.target.value } : prev))}
                onBlur={() => void saveProfilePatch({ niche: state.niche })}
                placeholder="e.g., Clean beauty for sensitive skin"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Website URL</label>
              <Input
                value={state.websiteUrl}
                onChange={(event) => setState((prev) => (prev ? { ...prev, websiteUrl: event.target.value } : prev))}
                onBlur={() => void saveProfilePatch({ websiteUrl: state.websiteUrl })}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Shopify Store URL</label>
              <Input
                value={state.shopifyUrl}
                onChange={(event) => setState((prev) => (prev ? { ...prev, shopifyUrl: event.target.value } : prev))}
                onBlur={() => void saveProfilePatch({ shopifyUrl: state.shopifyUrl })}
                placeholder="e.g., your-store.myshopify.com"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Brand story</label>
            <textarea
              value={state.brandStory}
              onChange={(event) => setState((prev) => (prev ? { ...prev, brandStory: event.target.value } : prev))}
              onBlur={() => void saveProfilePatch({ brandStory: state.brandStory })}
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 outline-none ring-0"
              placeholder="Tell the founder story in 2-3 sentences."
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Unique Selling Proposition (USP)</label>
            <textarea
              value={state.usp}
              onChange={(event) => setState((prev) => (prev ? { ...prev, usp: event.target.value } : prev))}
              onBlur={() => void saveProfilePatch({ usp: state.usp })}
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 outline-none ring-0"
              placeholder="What makes your brand fundamentally different?"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Mission statement</label>
            <textarea
              value={state.missionStatement}
              onChange={(event) => setState((prev) => (prev ? { ...prev, missionStatement: event.target.value } : prev))}
              onBlur={() => void saveProfilePatch({ missionStatement: state.missionStatement })}
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 outline-none ring-0"
              placeholder="What does this brand exist to change?"
            />
          </div>
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Target Audience</CardTitle>
          <CardDescription>Define who you serve and what motivates their decisions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <TextareaField
            label="Target Demographics"
            placeholder="e.g., Women 25-45, urban professionals, household income $75k+"
            rows={3}
            value={state.targetDemographics}
            onChange={(value) => setState((prev) => (prev ? { ...prev, targetDemographics: value } : prev))}
            onBlur={() => void saveProfilePatch({ targetDemographics: state.targetDemographics })}
          />
          <TextareaField
            label="Target Psychographics"
            placeholder="e.g., Health-conscious, values sustainability, prefers premium quality"
            rows={3}
            value={state.targetPsychographics}
            onChange={(value) => setState((prev) => (prev ? { ...prev, targetPsychographics: value } : prev))}
            onBlur={() => void saveProfilePatch({ targetPsychographics: state.targetPsychographics })}
          />
          <TextareaField
            label="Audience Pain Points"
            placeholder="e.g., Can't find clean beauty products that actually work"
            rows={3}
            value={state.audiencePainPoints}
            onChange={(value) => setState((prev) => (prev ? { ...prev, audiencePainPoints: value } : prev))}
            onBlur={() => void saveProfilePatch({ audiencePainPoints: state.audiencePainPoints })}
          />
          <TextareaField
            label="Audience Desires"
            placeholder="e.g., Want to feel confident about what they put on their skin"
            rows={3}
            value={state.audienceDesires}
            onChange={(value) => setState((prev) => (prev ? { ...prev, audienceDesires: value } : prev))}
            onBlur={() => void saveProfilePatch({ audienceDesires: state.audienceDesires })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Voice & Tone</CardTitle>
          <CardDescription>10 preset dimensions plus custom sliders for nuanced voice control.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {VOICE_PRESETS.map((preset) => (
            <div key={preset.key} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>{preset.left}</span>
                <span>{preset.right}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={state[preset.key]}
                onChange={(event) => {
                  const next = clampSlider(Number(event.target.value));
                  setState((prev) => (prev ? { ...prev, [preset.key]: next } : prev));
                  debouncedVoiceSave({ [preset.key]: next } as Partial<LocalState>);
                }}
                className="mt-2 w-full accent-indigo-400"
              />
              <p className="mt-2 text-xs text-zinc-400">{preset.description}</p>
            </div>
          ))}

          <div className="border-t border-white/10 pt-4">
            <CustomDimensionsSection
              items={customVoiceDimensions}
              onAdd={async (input) => {
                setError(null);
                try {
                  await addCustomVoiceDimension(input);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed to add dimension.");
                }
              }}
              onUpdate={async (id, value) => {
                setError(null);
                try {
                  await updateCustomVoiceDimension(id, value);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed to update dimension.");
                }
              }}
              onDelete={async (id) => {
                setError(null);
                try {
                  await deleteCustomVoiceDimension(id);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed to delete dimension.");
                }
              }}
            />
          </div>

          <TextareaField
            label="Voice Description"
            placeholder="Describe your brand voice in your own words. This is your chance to tell the AI anything the sliders don't capture."
            rows={4}
            value={state.voiceDescription}
            onChange={(value) => setState((prev) => (prev ? { ...prev, voiceDescription: value } : prev))}
            onBlur={() => void saveProfilePatch({ voiceDescription: state.voiceDescription })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messaging Rules</CardTitle>
          <CardDescription>Guardrails for what your brand always does and never does.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <RulesColumn
              title="Do's"
              accent="green"
              items={rules.filter((item) => item.type === "do")}
              onAdd={async (rule, priority) => {
                setError(null);
                try {
                  await addRule(rule, "do", priority);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed to add rule.");
                }
              }}
              onDelete={async (id) => {
                setError(null);
                try {
                  await deleteRule(id);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed to delete rule.");
                }
              }}
            />
            <RulesColumn
              title="Don'ts"
              accent="red"
              items={rules.filter((item) => item.type === "dont")}
              onAdd={async (rule, priority) => {
                setError(null);
                try {
                  await addRule(rule, "dont", priority);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed to add rule.");
                }
              }}
              onDelete={async (id) => {
                setError(null);
                try {
                  await deleteRule(id);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed to delete rule.");
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferred CTAs & Phrases</CardTitle>
          <CardDescription>Reusable language blocks used by AI generation and QA.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <TagCollection
              title="Preferred CTAs"
              placeholder="e.g., Shop Now, Discover More, Treat Yourself"
              items={ctas.map((item) => ({ id: item.id, text: item.text }))}
              onAdd={async (text) => {
                setError(null);
                try {
                  await addCta(text);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed to add CTA.");
                }
              }}
              onDelete={async (id) => {
                setError(null);
                try {
                  await deleteCta(id);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed to delete CTA.");
                }
              }}
            />

            <div className="space-y-4">
              <TagCollection
                title="Preferred Phrases"
                placeholder="e.g., Clean beauty, Glow from within"
                items={phrases
                  .filter((item) => item.type === "preferred")
                  .map((item) => ({ id: item.id, text: item.phrase }))}
                onAdd={async (text) => {
                  setError(null);
                  try {
                    await addPhrase(text, "preferred");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Failed to add phrase.");
                  }
                }}
                onDelete={async (id) => {
                  setError(null);
                  try {
                    await deletePhrase(id);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Failed to delete phrase.");
                  }
                }}
                tone="green"
              />
              <TagCollection
                title="Banned Phrases"
                placeholder="e.g., Cheap, Buy now or miss out, FOMO"
                items={phrases
                  .filter((item) => item.type === "banned")
                  .map((item) => ({ id: item.id, text: item.phrase }))}
                onAdd={async (text) => {
                  setError(null);
                  try {
                    await addPhrase(text, "banned");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Failed to add phrase.");
                  }
                }}
                onDelete={async (id) => {
                  setError(null);
                  try {
                    await deletePhrase(id);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Failed to delete phrase.");
                  }
                }}
                tone="red"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Preferences</CardTitle>
          <CardDescription>Defaults that shape cadence and format in generated campaigns.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="Greeting Style"
            value={state.greetingStyle}
            options={[
              ["formal", "Formal (Dear [Name])"],
              ["friendly", "Friendly (Hey [Name]!)"],
              ["casual", "Casual (Hi there)"],
              ["none", "None"],
            ]}
            onChange={(value) => {
              setState((prev) => (prev ? { ...prev, greetingStyle: value } : prev));
              void saveProfilePatch({ greetingStyle: value });
            }}
          />
          <SelectField
            label="Sign-off Style"
            value={state.signOffStyle}
            options={[
              ["warm", "Warm (With love,)"],
              ["professional", "Professional (Best regards,)"],
              ["casual", "Casual (Cheers,)"],
              ["brand_only", "Brand name only"],
            ]}
            onChange={(value) => {
              setState((prev) => (prev ? { ...prev, signOffStyle: value } : prev));
              void saveProfilePatch({ signOffStyle: value });
            }}
          />
          <RadioRow
            label="Emoji Usage"
            value={state.emojiUsage}
            options={["never", "sparingly", "often"]}
            onChange={(value) => {
              setState((prev) => (prev ? { ...prev, emojiUsage: value } : prev));
              void saveProfilePatch({ emojiUsage: value });
            }}
          />
          <RadioRow
            label="Preferred Length"
            value={state.preferredLength}
            options={["short", "medium", "long"]}
            labels={{
              short: "Short (under 150 words)",
              medium: "Medium (150-300 words)",
              long: "Long (300+ words)",
            }}
            onChange={(value) => {
              setState((prev) => (prev ? { ...prev, preferredLength: value } : prev));
              void saveProfilePatch({ preferredLength: value });
            }}
          />
          <RadioRow
            label="Discount Philosophy"
            value={state.discountPhilosophy}
            options={["never", "rarely", "strategically", "frequently"]}
            onChange={(value) => {
              setState((prev) => (prev ? { ...prev, discountPhilosophy: value } : prev));
              void saveProfilePatch({ discountPhilosophy: value });
            }}
          />
        </CardContent>
      </Card>

      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

function TextareaField({
  label,
  placeholder,
  rows,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  placeholder: string;
  rows: number;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-zinc-400">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        rows={rows}
        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 outline-none ring-0"
        placeholder={placeholder}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-100 outline-none"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function RadioRow({
  label,
  value,
  options,
  onChange,
  labels,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-400">{label}</p>
      <div className="space-y-1">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm text-zinc-200">
            <input
              type="radio"
              checked={value === option}
              onChange={() => onChange(option)}
              className="accent-indigo-400"
            />
            {labels?.[option] ?? option}
          </label>
        ))}
      </div>
    </div>
  );
}

function RulesColumn({
  title,
  accent,
  items,
  onAdd,
  onDelete,
}: {
  title: string;
  accent: "green" | "red";
  items: Array<{ id: string; rule: string; priority: "critical" | "important" | "nice-to-have" }>;
  onAdd: (rule: string, priority: "critical" | "important" | "nice-to-have") => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<"critical" | "important" | "nice-to-have">("important");
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className={`text-sm font-medium ${accent === "green" ? "text-emerald-200" : "text-red-200"}`}>{title}</p>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-white/10 px-2 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-zinc-100">{item.rule}</p>
              <button
                type="button"
                onClick={() => void onDelete(item.id)}
                className="text-zinc-400 hover:text-zinc-200"
                aria-label="Delete rule"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <PriorityBadge priority={item.priority} />
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Add a rule..." />
        <div className="flex gap-2">
          <select
            value={priority}
            onChange={(event) =>
              setPriority(event.target.value as "critical" | "important" | "nice-to-have")
            }
            className="h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-100"
          >
            <option value="critical">critical</option>
            <option value="important">important</option>
            <option value="nice-to-have">nice-to-have</option>
          </select>
          <Button
            variant="outline"
            onClick={() => {
              const input = text.trim();
              if (!input) return;
              void onAdd(input, priority);
              setText("");
              setPriority("important");
            }}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: "critical" | "important" | "nice-to-have" }) {
  const variant = priority === "critical" ? "destructive" : priority === "important" ? "warning" : "outline";
  return <Badge variant={variant}>{priority}</Badge>;
}

function TagCollection({
  title,
  placeholder,
  items,
  onAdd,
  onDelete,
  tone = "default",
}: {
  title: string;
  placeholder: string;
  items: Array<{ id: string; text: string }>;
  onAdd: (text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  tone?: "default" | "green" | "red";
}) {
  const [value, setValue] = useState("");
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p
        className={`text-sm font-medium ${
          tone === "green" ? "text-emerald-200" : tone === "red" ? "text-red-200" : "text-zinc-100"
        }`}
      >
        {title}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item.id} className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1 text-xs text-zinc-200">
            {item.text}
            <button
              type="button"
              onClick={() => void onDelete(item.id)}
              className="text-zinc-400 hover:text-zinc-200"
              aria-label="Delete item"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} />
        <Button
          variant="outline"
          onClick={() => {
            const next = value.trim();
            if (!next) return;
            void onAdd(next);
            setValue("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function CustomDimensionsSection({
  items,
  onAdd,
  onUpdate,
  onDelete,
}: {
  items: Array<{ id: string; leftLabel: string; rightLabel: string; description: string | null; value: number }>;
  onAdd: (input: { leftLabel: string; rightLabel: string; description: string }) => Promise<void>;
  onUpdate: (id: string, value: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [leftLabel, setLeftLabel] = useState("");
  const [rightLabel, setRightLabel] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-zinc-100">Custom Dimensions</p>
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>{item.leftLabel}</span>
            <button
              type="button"
              onClick={() => void onDelete(item.id)}
              className="text-zinc-400 hover:text-zinc-200"
              aria-label="Delete custom dimension"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <span>{item.rightLabel}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={item.value}
            onChange={(event) => void onUpdate(item.id, Number(event.target.value))}
            className="mt-2 w-full accent-indigo-400"
          />
          {item.description ? <p className="mt-2 text-xs text-zinc-400">{item.description}</p> : null}
        </div>
      ))}

      {!open ? (
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Custom Dimension
        </Button>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="grid gap-2">
            <Input value={leftLabel} onChange={(event) => setLeftLabel(event.target.value)} placeholder="e.g., Rebellious" />
            <Input value={rightLabel} onChange={(event) => setRightLabel(event.target.value)} placeholder="e.g., Conformist" />
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g., Does your brand challenge the status quo or play it by the book?"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!leftLabel.trim() || !rightLabel.trim()) return;
                void onAdd({
                  leftLabel: leftLabel.trim(),
                  rightLabel: rightLabel.trim(),
                  description: description.trim(),
                });
                setLeftLabel("");
                setRightLabel("");
                setDescription("");
                setOpen(false);
              }}
            >
              Add
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
