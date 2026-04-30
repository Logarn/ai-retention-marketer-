"use client";

import useSWR from "swr";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ApiEnvelope = {
  ok: boolean;
  error?: string;
  issues?: string[];
};

type PlanItem = {
  id: string;
  planId: string;
  title: string;
  campaignType: string;
  goal: string;
  segment: string;
  suggestedSendDate: string;
  subjectLineAngle: string | null;
  primaryProduct: string | null;
  why: string;
  confidenceScore: number | null;
  status: string;
};

type CampaignPlan = {
  id: string;
  name: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  status: string;
  summary: string | null;
  strategyNotes: string | null;
  itemCount: number;
  items: PlanItem[];
};

type PlanGenerateResponse = ApiEnvelope & {
  plan: CampaignPlan;
};

type PlanListResponse = ApiEnvelope & {
  plans: Array<Omit<CampaignPlan, "items">>;
};

type BriefSection = {
  id: string;
  briefId: string;
  type: string;
  heading: string | null;
  body: string;
  sortOrder: number;
};

type Brief = {
  id: string;
  planItemId: string | null;
  title: string;
  campaignType: string;
  segment: string;
  goal: string;
  subjectLines: string[];
  previewTexts: string[];
  angle: string;
  primaryProduct: string | null;
  status: string;
  designNotes: string | null;
  cta: string | null;
  createdAt: string;
  updatedAt: string;
  sectionCount: number;
  sections?: BriefSection[];
};

type BriefListResponse = ApiEnvelope & {
  briefs: Brief[];
};

type BriefResponse = ApiEnvelope & {
  brief: Brief & { sections: BriefSection[] };
};

type SectionResponse = ApiEnvelope & {
  section: BriefSection;
};

type BriefEditState = {
  status: string;
  cta: string;
};

type SectionEditState = {
  heading: string;
  body: string;
};

const fetcher = async <T extends ApiEnvelope>(url: string): Promise<T> => {
  const response = await fetch(url);
  return parseApiResponse<T>(response);
};

async function parseApiResponse<T extends ApiEnvelope>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !data?.ok) {
    const message =
      data?.issues?.join(" ") ??
      data?.error ??
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function splitConstraints(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function nextDate(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return formatDateInput(date);
}

function humanize(value: string | null | undefined) {
  if (!value) return "None";
  return value.replace(/[_-]+/g, " ");
}

function confidenceLabel(value: number | null) {
  if (value === null || Number.isNaN(value)) return "No score";
  return `${Math.round(value * 100)}% confidence`;
}

function alertStyles(kind: "error" | "success") {
  return kind === "error"
    ? "border-red-300/25 bg-red-500/10 text-red-100"
    : "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
}

export function PlanBriefClient() {
  const [startDate, setStartDate] = useState(() => nextDate(1));
  const [endDate, setEndDate] = useState(() => nextDate(7));
  const [campaignCount, setCampaignCount] = useState("3");
  const [focus, setFocus] = useState("repeat purchase");
  const [constraints, setConstraints] = useState("no discounts\ninclude one VIP campaign");
  const [generatedPlan, setGeneratedPlan] = useState<CampaignPlan | null>(null);
  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(null);
  const [selectedBrief, setSelectedBrief] = useState<(Brief & { sections: BriefSection[] }) | null>(null);
  const [briefEdit, setBriefEdit] = useState<BriefEditState>({ status: "draft", cta: "" });
  const [sectionEdits, setSectionEdits] = useState<Record<string, SectionEditState>>({});
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [briefGeneratingId, setBriefGeneratingId] = useState<string | null>(null);
  const [isLoadingBrief, setIsLoadingBrief] = useState(false);
  const [isSavingBrief, setIsSavingBrief] = useState(false);
  const [savingSectionId, setSavingSectionId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const {
    data: plansData,
    error: plansError,
    isLoading: plansLoading,
    mutate: refreshPlans,
  } = useSWR<PlanListResponse>("/api/planner/plans", fetcher);
  const {
    data: briefsData,
    error: briefsError,
    isLoading: briefsLoading,
    mutate: refreshBriefs,
  } = useSWR<BriefListResponse>("/api/briefs?limit=25", fetcher);

  const savedPlans = plansData?.plans ?? [];
  const briefs = briefsData?.briefs ?? [];
  const latestPlan = generatedPlan ?? savedPlans[0] ?? null;
  const generatedPlanItems = generatedPlan?.items ?? [];
  const briefSections = useMemo(
    () => [...(selectedBrief?.sections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [selectedBrief],
  );

  const loadBrief = useCallback(async (briefId: string) => {
    setIsLoadingBrief(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/briefs/${briefId}`);
      const data = await parseApiResponse<BriefResponse>(response);
      setSelectedBriefId(briefId);
      setSelectedBrief(data.brief);
      setBriefEdit({
        status: data.brief.status,
        cta: data.brief.cta ?? "",
      });
      setSectionEdits(
        Object.fromEntries(
          data.brief.sections.map((section) => [
            section.id,
            {
              heading: section.heading ?? "",
              body: section.body,
            },
          ]),
        ),
      );
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not load brief." });
    } finally {
      setIsLoadingBrief(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedBriefId && briefs.length) {
      void loadBrief(briefs[0].id);
    }
  }, [briefs, loadBrief, selectedBriefId]);

  async function generatePlan() {
    setIsGeneratingPlan(true);
    setMessage(null);
    try {
      const response = await fetch("/api/planner/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          campaignCount: Number(campaignCount),
          focus: focus.trim() || null,
          constraints: splitConstraints(constraints),
        }),
      });
      const data = await parseApiResponse<PlanGenerateResponse>(response);
      setGeneratedPlan(data.plan);
      await refreshPlans();
      setMessage({ kind: "success", text: "Plan generated and saved." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not generate plan." });
    } finally {
      setIsGeneratingPlan(false);
    }
  }

  async function generateBrief(planItemId: string) {
    setBriefGeneratingId(planItemId);
    setMessage(null);
    try {
      const response = await fetch("/api/briefs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planItemId }),
      });
      const data = await parseApiResponse<BriefResponse>(response);
      await refreshBriefs();
      setSelectedBriefId(data.brief.id);
      setSelectedBrief(data.brief);
      setBriefEdit({
        status: data.brief.status,
        cta: data.brief.cta ?? "",
      });
      setSectionEdits(
        Object.fromEntries(
          data.brief.sections.map((section) => [
            section.id,
            {
              heading: section.heading ?? "",
              body: section.body,
            },
          ]),
        ),
      );
      setMessage({ kind: "success", text: "Brief generated from plan item." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not generate brief." });
    } finally {
      setBriefGeneratingId(null);
    }
  }

  async function saveBrief() {
    if (!selectedBrief) return;
    setIsSavingBrief(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/briefs/${selectedBrief.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: briefEdit.status,
          cta: briefEdit.cta,
        }),
      });
      const data = await parseApiResponse<BriefResponse>(response);
      setSelectedBrief(data.brief);
      setBriefEdit({
        status: data.brief.status,
        cta: data.brief.cta ?? "",
      });
      await refreshBriefs();
      setMessage({ kind: "success", text: "Brief saved." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not save brief." });
    } finally {
      setIsSavingBrief(false);
    }
  }

  async function saveSection(sectionId: string) {
    if (!selectedBrief) return;
    const edit = sectionEdits[sectionId];
    if (!edit) return;
    setSavingSectionId(sectionId);
    setMessage(null);
    try {
      const response = await fetch(`/api/briefs/${selectedBrief.id}/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heading: edit.heading,
          body: edit.body,
        }),
      });
      await parseApiResponse<SectionResponse>(response);
      await loadBrief(selectedBrief.id);
      await refreshBriefs();
      setMessage({ kind: "success", text: "Section saved." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not save section." });
    } finally {
      setSavingSectionId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200/80">Planner</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">Plan to Brief</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Generate campaign plans, turn plan items into briefs, and edit the saved brief structure.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refreshBriefs()} disabled={briefsLoading}>
          <RefreshCw size={16} />
          Refresh Briefs
        </Button>
      </div>

      {message ? (
        <div className={cn("rounded-xl border px-4 py-3 text-sm", alertStyles(message.kind))}>{message.text}</div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays size={17} className="text-orange-300" />
                Generate Plan
              </CardTitle>
              <CardDescription>Use the local Planner API to save a campaign plan artifact.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm text-slate-300">
                  <span>Start date</span>
                  <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                </label>
                <label className="space-y-1.5 text-sm text-slate-300">
                  <span>End date</span>
                  <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                <label className="space-y-1.5 text-sm text-slate-300">
                  <span>Count</span>
                  <Input
                    inputMode="numeric"
                    value={campaignCount}
                    onChange={(event) => setCampaignCount(event.target.value)}
                  />
                </label>
                <label className="space-y-1.5 text-sm text-slate-300">
                  <span>Focus</span>
                  <Input value={focus} onChange={(event) => setFocus(event.target.value)} />
                </label>
              </div>
              <label className="space-y-1.5 text-sm text-slate-300">
                <span>Constraints</span>
                <textarea
                  className="textarea-base min-h-28 w-full px-3.5 py-3 text-sm"
                  value={constraints}
                  onChange={(event) => setConstraints(event.target.value)}
                />
              </label>
              <Button onClick={generatePlan} disabled={isGeneratingPlan} className="w-full sm:w-auto">
                {isGeneratingPlan ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                Generate Plan
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Generated Plan</CardTitle>
              <CardDescription>
                {latestPlan
                  ? `${latestPlan.itemCount} campaign item${latestPlan.itemCount === 1 ? "" : "s"} saved`
                  : plansLoading
                    ? "Loading saved plans"
                    : "No saved plan yet"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {plansError ? (
                <div className={cn("rounded-xl border px-4 py-3 text-sm", alertStyles("error"))}>
                  Could not load saved plans.
                </div>
              ) : null}

              {latestPlan ? (
                <>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-100">{latestPlan.name}</h2>
                      <Badge variant="secondary">{latestPlan.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{latestPlan.summary ?? "No summary saved."}</p>
                    <p className="mt-3 text-xs text-slate-500">
                      {formatDate(latestPlan.dateRangeStart)} to {formatDate(latestPlan.dateRangeEnd)}
                    </p>
                  </div>

                  {generatedPlanItems.length ? (
                    <div className="space-y-3">
                      {generatedPlanItems.map((item) => (
                        <article key={item.id} className="rounded-xl border border-white/10 bg-[#0c1421] p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-slate-100">{item.title}</h3>
                                <Badge variant="outline">{item.campaignType}</Badge>
                              </div>
                              <p className="mt-2 text-sm text-slate-400">{item.goal}</p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => generateBrief(item.id)}
                              disabled={briefGeneratingId === item.id}
                              className="shrink-0"
                            >
                              {briefGeneratingId === item.id ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <FileText size={16} />
                              )}
                              Generate Brief
                            </Button>
                          </div>
                          <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                            <span>Segment: {humanize(item.segment)}</span>
                            <span>Send: {formatDate(item.suggestedSendDate)}</span>
                            <span>{confidenceLabel(item.confidenceScore)}</span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-300">{item.why}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                      Saved plan summaries are loaded. Generate a fresh plan to see actionable items here.
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                  Create a plan to display recommended campaign items.
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <WandSparkles size={17} className="text-orange-300" />
                Briefs
              </CardTitle>
              <CardDescription>Generated briefs from saved plan items.</CardDescription>
            </CardHeader>
            <CardContent>
              {briefsError ? (
                <div className={cn("rounded-xl border px-4 py-3 text-sm", alertStyles("error"))}>
                  Could not load briefs.
                </div>
              ) : null}

              {briefsLoading ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                  Loading briefs...
                </div>
              ) : briefs.length ? (
                <div className="grid gap-2">
                  {briefs.map((brief) => (
                    <button
                      key={brief.id}
                      type="button"
                      onClick={() => loadBrief(brief.id)}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-colors",
                        selectedBriefId === brief.id
                          ? "border-orange-300/40 bg-orange-300/10"
                          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100">{brief.title}</span>
                        <Badge variant="secondary">{brief.status}</Badge>
                        <Badge variant="outline">{brief.sectionCount} sections</Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{brief.angle}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                  Generate a brief from a plan item to start the queue.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brief Detail</CardTitle>
              <CardDescription>
                {selectedBrief ? `Last saved ${formatDate(selectedBrief.updatedAt)}` : "Select a brief to edit"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {isLoadingBrief ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                  Loading brief detail...
                </div>
              ) : selectedBrief ? (
                <>
                  <div className="rounded-xl border border-white/10 bg-[#0c1421] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-50">{selectedBrief.title}</h2>
                        <p className="mt-1 text-sm text-slate-400">
                          {selectedBrief.campaignType} for {humanize(selectedBrief.segment)}
                        </p>
                      </div>
                      <Badge variant="outline">{selectedBrief.primaryProduct ?? "No product"}</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{selectedBrief.angle}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5 text-sm text-slate-300">
                        <span>Status</span>
                        <Select
                          value={briefEdit.status}
                          onChange={(event) => setBriefEdit((current) => ({ ...current, status: event.target.value }))}
                        >
                          <option value="draft">Draft</option>
                          <option value="ready_for_copy_qc">Ready for copy QC</option>
                          <option value="ready_for_design">Ready for design</option>
                          <option value="ready_to_schedule">Ready to schedule</option>
                          <option value="approved">Approved</option>
                        </Select>
                      </label>
                      <label className="space-y-1.5 text-sm text-slate-300">
                        <span>CTA</span>
                        <Input
                          value={briefEdit.cta}
                          onChange={(event) => setBriefEdit((current) => ({ ...current, cta: event.target.value }))}
                        />
                      </label>
                    </div>
                    <Button onClick={saveBrief} disabled={isSavingBrief} className="mt-4">
                      {isSavingBrief ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      Save Brief
                    </Button>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <h3 className="text-sm font-semibold text-slate-100">Subject lines</h3>
                      <ul className="mt-3 space-y-2 text-sm text-slate-300">
                        {selectedBrief.subjectLines.map((line) => (
                          <li key={line} className="rounded-lg bg-black/20 px-3 py-2">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <h3 className="text-sm font-semibold text-slate-100">Preview texts</h3>
                      <ul className="mt-3 space-y-2 text-sm text-slate-300">
                        {selectedBrief.previewTexts.map((line) => (
                          <li key={line} className="rounded-lg bg-black/20 px-3 py-2">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {selectedBrief.designNotes ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <h3 className="text-sm font-semibold text-slate-100">Design notes</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{selectedBrief.designNotes}</p>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    {briefSections.map((section) => {
                      const edit = sectionEdits[section.id] ?? {
                        heading: section.heading ?? "",
                        body: section.body,
                      };
                      return (
                        <article key={section.id} className="rounded-xl border border-white/10 bg-[#0c1421] p-4">
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{humanize(section.type)}</Badge>
                            <span className="text-xs text-slate-500">Order {section.sortOrder}</span>
                          </div>
                          <label className="space-y-1.5 text-sm text-slate-300">
                            <span>Heading</span>
                            <Input
                              value={edit.heading}
                              onChange={(event) =>
                                setSectionEdits((current) => ({
                                  ...current,
                                  [section.id]: {
                                    ...edit,
                                    heading: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="mt-3 block space-y-1.5 text-sm text-slate-300">
                            <span>Body</span>
                            <textarea
                              className="textarea-base min-h-32 w-full px-3.5 py-3 text-sm"
                              value={edit.body}
                              onChange={(event) =>
                                setSectionEdits((current) => ({
                                  ...current,
                                  [section.id]: {
                                    ...edit,
                                    body: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => saveSection(section.id)}
                            disabled={savingSectionId === section.id}
                            className="mt-3"
                          >
                            {savingSectionId === section.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Save size={16} />
                            )}
                            Save Section
                          </Button>
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                  No brief selected.
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
