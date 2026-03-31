"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Brain, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type BrandProfileResponse = {
  profile: {
    id: string;
    brandName: string;
    tagline: string | null;
    industryVertical: string;
    pricePositioning: string;
    foundedYear: number | null;
    brandStory: string | null;
    missionStatement: string | null;
    coreValues: string[];
    websiteUrl: string | null;
    shopifyStoreUrl: string | null;
    lastStoreAnalysis: string | null;
    createdAt: string;
    updatedAt: string;
  };
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
};

function toStringArray(input: string) {
  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export default function BrainProfilePage() {
  const { data, isLoading, mutate } = useSWR<BrandProfileResponse>("/api/brain/profile", fetcher);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const profile = data?.profile;
  const [form, setForm] = useState({
    brandName: "",
    tagline: "",
    industryVertical: "",
    pricePositioning: "",
    foundedYear: "",
    brandStory: "",
    missionStatement: "",
    coreValues: "",
    websiteUrl: "",
    shopifyStoreUrl: "",
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      brandName: profile.brandName ?? "",
      tagline: profile.tagline ?? "",
      industryVertical: profile.industryVertical ?? "",
      pricePositioning: profile.pricePositioning ?? "",
      foundedYear: profile.foundedYear ? String(profile.foundedYear) : "",
      brandStory: profile.brandStory ?? "",
      missionStatement: profile.missionStatement ?? "",
      coreValues: profile.coreValues.join(", "),
      websiteUrl: profile.websiteUrl ?? "",
      shopifyStoreUrl: profile.shopifyStoreUrl ?? "",
    });
  }, [profile]);

  async function handleSave() {
    setIsSaving(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/brain/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: form.brandName,
          tagline: form.tagline || null,
          industryVertical: form.industryVertical,
          pricePositioning: form.pricePositioning,
          foundedYear: form.foundedYear ? Number(form.foundedYear) : null,
          brandStory: form.brandStory || null,
          missionStatement: form.missionStatement || null,
          coreValues: toStringArray(form.coreValues),
          websiteUrl: form.websiteUrl || null,
          shopifyStoreUrl: form.shopifyStoreUrl || null,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(json.error || "Failed to save profile");
      setNotice("Brand profile saved.");
      await mutate();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Brand Profile</h1>
        <p className="text-sm text-zinc-400">
          Define the core identity that powers Sauti&apos;s on-brand decisions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-orange-300" />
            The Core Identity
          </CardTitle>
          <CardDescription>
            Start with foundational fields. We&apos;ll expand Voice, Rules, and Intelligence sections next.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading profile...
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Brand name</label>
              <Input
                value={form.brandName}
                onChange={(event) => setForm((prev) => ({ ...prev, brandName: event.target.value }))}
                placeholder="Sauti"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Tagline</label>
              <Input
                value={form.tagline}
                onChange={(event) => setForm((prev) => ({ ...prev, tagline: event.target.value }))}
                placeholder="Retention intelligence for modern Shopify brands"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Industry vertical</label>
              <Input
                value={form.industryVertical}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, industryVertical: event.target.value }))
                }
                placeholder="Skincare"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Price positioning</label>
              <Input
                value={form.pricePositioning}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, pricePositioning: event.target.value }))
                }
                placeholder="Premium"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Founded year</label>
              <Input
                value={form.foundedYear}
                onChange={(event) => setForm((prev) => ({ ...prev, foundedYear: event.target.value }))}
                placeholder="2021"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Core values (comma-separated)</label>
              <Input
                value={form.coreValues}
                onChange={(event) => setForm((prev) => ({ ...prev, coreValues: event.target.value }))}
                placeholder="Quality, Trust, Sustainability"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Website URL</label>
              <Input
                value={form.websiteUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, websiteUrl: event.target.value }))}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Shopify store URL</label>
              <Input
                value={form.shopifyStoreUrl}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, shopifyStoreUrl: event.target.value }))
                }
                placeholder="https://your-store.myshopify.com"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Brand story</label>
            <textarea
              value={form.brandStory}
              onChange={(event) => setForm((prev) => ({ ...prev, brandStory: event.target.value }))}
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 outline-none ring-0"
              placeholder="Tell the founder story in 2-3 sentences."
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Mission statement</label>
            <textarea
              value={form.missionStatement}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, missionStatement: event.target.value }))
              }
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 outline-none ring-0"
              placeholder="What does this brand exist to change?"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Brand Profile
            </Button>
            {notice ? <p className="text-xs text-emerald-300">{notice}</p> : null}
            {error ? <p className="text-xs text-red-300">{error}</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
