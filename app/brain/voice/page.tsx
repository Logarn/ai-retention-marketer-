"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Mic2, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type TonePreset = {
  label: string;
  key: string;
  description: string;
  subjectLine: string;
  openingLine: string;
  cta: string;
};

type VoiceToneResponse = {
  voiceTone: {
    id: string;
    brandProfileId: string;
    formalCasual: number;
    seriousPlayful: number;
    reservedEnthusiastic: number;
    technicalSimple: number;
    traditionalEdgy: number;
    corporatePersonal: number;
    sentenceLength: string | null;
    paragraphLength: string | null;
    useContractions: string | null;
    useExclamations: string | null;
    useCaps: string | null;
    greetingStyle: string | null;
    signoffStyle: string | null;
    customerReference: string | null;
    brandReference: string | null;
    preferredAdjectives: string[];
    preferredVerbs: string[];
    preferredCTAs: string[];
    signaturePhrases: string[];
    welcomeTone: TonePreset;
    promotionalTone: TonePreset;
    educationalTone: TonePreset;
    vipTone: TonePreset;
    winbackTone: TonePreset;
    transactionalTone: TonePreset;
    apologyTone: TonePreset;
    launchTone: TonePreset;
  };
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
};

type SliderKey =
  | "formalCasual"
  | "seriousPlayful"
  | "reservedEnthusiastic"
  | "technicalSimple"
  | "traditionalEdgy"
  | "corporatePersonal";

const sliderConfig: Array<{ key: SliderKey; left: string; right: string; label: string }> = [
  { key: "formalCasual", left: "Formal", right: "Casual", label: "Formality" },
  { key: "seriousPlayful", left: "Serious", right: "Playful", label: "Energy" },
  { key: "reservedEnthusiastic", left: "Reserved", right: "Enthusiastic", label: "Excitement" },
  { key: "technicalSimple", left: "Technical", right: "Simple", label: "Complexity" },
  { key: "traditionalEdgy", left: "Traditional", right: "Edgy", label: "Edge" },
  { key: "corporatePersonal", left: "Corporate", right: "Personal", label: "Personality" },
];

const toneOrder = [
  "welcomeTone",
  "promotionalTone",
  "educationalTone",
  "vipTone",
  "winbackTone",
  "transactionalTone",
  "apologyTone",
  "launchTone",
] as const;

type ToneKey = (typeof toneOrder)[number];

function splitCsv(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function BrainVoicePage() {
  const { data, mutate, isLoading } = useSWR<VoiceToneResponse>("/api/brain/voice-tone", fetcher);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<null | {
    formalCasual: number;
    seriousPlayful: number;
    reservedEnthusiastic: number;
    technicalSimple: number;
    traditionalEdgy: number;
    corporatePersonal: number;
    sentenceLength: string;
    paragraphLength: string;
    useContractions: string;
    useExclamations: string;
    useCaps: string;
    greetingStyle: string;
    signoffStyle: string;
    customerReference: string;
    brandReference: string;
    preferredAdjectives: string;
    preferredVerbs: string;
    preferredCTAs: string;
    signaturePhrases: string;
    tones: Record<ToneKey, TonePreset>;
  }>(null);

  useMemo(() => {
    if (!data?.voiceTone) return;
    const voice = data.voiceTone;
    setForm({
      formalCasual: voice.formalCasual,
      seriousPlayful: voice.seriousPlayful,
      reservedEnthusiastic: voice.reservedEnthusiastic,
      technicalSimple: voice.technicalSimple,
      traditionalEdgy: voice.traditionalEdgy,
      corporatePersonal: voice.corporatePersonal,
      sentenceLength: voice.sentenceLength ?? "",
      paragraphLength: voice.paragraphLength ?? "",
      useContractions: voice.useContractions ?? "",
      useExclamations: voice.useExclamations ?? "",
      useCaps: voice.useCaps ?? "",
      greetingStyle: voice.greetingStyle ?? "",
      signoffStyle: voice.signoffStyle ?? "",
      customerReference: voice.customerReference ?? "",
      brandReference: voice.brandReference ?? "",
      preferredAdjectives: voice.preferredAdjectives.join(", "),
      preferredVerbs: voice.preferredVerbs.join(", "),
      preferredCTAs: voice.preferredCTAs.join(", "),
      signaturePhrases: voice.signaturePhrases.join(", "),
      tones: {
        welcomeTone: voice.welcomeTone,
        promotionalTone: voice.promotionalTone,
        educationalTone: voice.educationalTone,
        vipTone: voice.vipTone,
        winbackTone: voice.winbackTone,
        transactionalTone: voice.transactionalTone,
        apologyTone: voice.apologyTone,
        launchTone: voice.launchTone,
      },
    });
  }, [data?.voiceTone]);

  async function saveVoiceTone() {
    if (!form) return;
    setIsSaving(true);
    setNotice(null);
    setError(null);

    try {
      const response = await fetch("/api/brain/voice-tone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formalCasual: form.formalCasual,
          seriousPlayful: form.seriousPlayful,
          reservedEnthusiastic: form.reservedEnthusiastic,
          technicalSimple: form.technicalSimple,
          traditionalEdgy: form.traditionalEdgy,
          corporatePersonal: form.corporatePersonal,
          sentenceLength: form.sentenceLength || null,
          paragraphLength: form.paragraphLength || null,
          useContractions: form.useContractions || null,
          useExclamations: form.useExclamations || null,
          useCaps: form.useCaps || null,
          greetingStyle: form.greetingStyle || null,
          signoffStyle: form.signoffStyle || null,
          customerReference: form.customerReference || null,
          brandReference: form.brandReference || null,
          preferredAdjectives: splitCsv(form.preferredAdjectives),
          preferredVerbs: splitCsv(form.preferredVerbs),
          preferredCTAs: splitCsv(form.preferredCTAs),
          signaturePhrases: splitCsv(form.signaturePhrases),
          welcomeTone: form.tones.welcomeTone,
          promotionalTone: form.tones.promotionalTone,
          educationalTone: form.tones.educationalTone,
          vipTone: form.tones.vipTone,
          winbackTone: form.tones.winbackTone,
          transactionalTone: form.tones.transactionalTone,
          apologyTone: form.tones.apologyTone,
          launchTone: form.tones.launchTone,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(json.error || "Failed to save Voice & Tone");
      setNotice("Voice & Tone saved.");
      await mutate();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  function updateTone(toneKey: ToneKey, patch: Partial<TonePreset>) {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tones: {
          ...prev.tones,
          [toneKey]: {
            ...prev.tones[toneKey],
            ...patch,
          },
        },
      };
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-100">
          <Mic2 className="h-5 w-5 text-indigo-300" />
          Voice & Tone Engine
        </h1>
        <p className="text-sm text-zinc-400">
          Tune Sauti&apos;s writing behavior to match your brand across every context.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overall Voice Character</CardTitle>
          <CardDescription>Use sliders to define how the brand sounds at baseline.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading || !form ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading voice profile...
            </div>
          ) : (
            sliderConfig.map((slider) => (
              <div key={slider.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{slider.left}</span>
                  <span>{slider.label}</span>
                  <span>{slider.right}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={form[slider.key]}
                  onChange={(event) =>
                    setForm((prev) => {
                      if (!prev) return prev;
                      return { ...prev, [slider.key]: Number(event.target.value) };
                    })
                  }
                  className="w-full accent-indigo-400"
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Writing Rules</CardTitle>
          <CardDescription>Sentence style, punctuation, and signature vocabulary.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {form ? (
            <>
              <Field label="Sentence length" value={form.sentenceLength} onChange={(v) => setForm((p) => (p ? { ...p, sentenceLength: v } : p))} />
              <Field label="Paragraph length" value={form.paragraphLength} onChange={(v) => setForm((p) => (p ? { ...p, paragraphLength: v } : p))} />
              <Field label="Contractions" value={form.useContractions} onChange={(v) => setForm((p) => (p ? { ...p, useContractions: v } : p))} />
              <Field label="Exclamation usage" value={form.useExclamations} onChange={(v) => setForm((p) => (p ? { ...p, useExclamations: v } : p))} />
              <Field label="ALL CAPS usage" value={form.useCaps} onChange={(v) => setForm((p) => (p ? { ...p, useCaps: v } : p))} />
              <Field label="Greeting style" value={form.greetingStyle} onChange={(v) => setForm((p) => (p ? { ...p, greetingStyle: v } : p))} />
              <Field label="Signoff style" value={form.signoffStyle} onChange={(v) => setForm((p) => (p ? { ...p, signoffStyle: v } : p))} />
              <Field label="How we refer to customer" value={form.customerReference} onChange={(v) => setForm((p) => (p ? { ...p, customerReference: v } : p))} />
              <Field label="How brand refers to itself" value={form.brandReference} onChange={(v) => setForm((p) => (p ? { ...p, brandReference: v } : p))} />
              <Field label="Preferred adjectives (CSV)" value={form.preferredAdjectives} onChange={(v) => setForm((p) => (p ? { ...p, preferredAdjectives: v } : p))} />
              <Field label="Preferred verbs (CSV)" value={form.preferredVerbs} onChange={(v) => setForm((p) => (p ? { ...p, preferredVerbs: v } : p))} />
              <Field label="Preferred CTAs (CSV)" value={form.preferredCTAs} onChange={(v) => setForm((p) => (p ? { ...p, preferredCTAs: v } : p))} />
              <Field label="Signature phrases (CSV)" value={form.signaturePhrases} onChange={(v) => setForm((p) => (p ? { ...p, signaturePhrases: v } : p))} />
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tone Variations by Context</CardTitle>
          <CardDescription>
            Define message style for welcome, promo, educational, VIP, win-back, transactional, apology, and launch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {form
            ? toneOrder.map((toneKey) => {
                const tone = form.tones[toneKey];
                return (
                  <div key={toneKey} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-medium text-zinc-200">{tone.label}</h3>
                      <Badge variant="secondary">{tone.key}</Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field
                        label="Tone description"
                        value={tone.description}
                        onChange={(value) => updateTone(toneKey, { description: value })}
                      />
                      <Field
                        label="Example subject line"
                        value={tone.subjectLine}
                        onChange={(value) => updateTone(toneKey, { subjectLine: value })}
                      />
                      <Field
                        label="Example opening line"
                        value={tone.openingLine}
                        onChange={(value) => updateTone(toneKey, { openingLine: value })}
                      />
                      <Field
                        label="Example CTA"
                        value={tone.cta}
                        onChange={(value) => updateTone(toneKey, { cta: value })}
                      />
                    </div>
                  </div>
                );
              })
            : null}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={() => void saveVoiceTone()} disabled={isSaving || !form}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Voice & Tone
        </Button>
        {notice ? <p className="text-xs text-emerald-300">{notice}</p> : null}
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-zinc-400">{label}</label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
