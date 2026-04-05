"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type BrandInsights = {
  voiceNotes?: string;
  dosFound?: string[];
  dontsFound?: string[];
  ctasFound?: string[];
  phrasesPreferred?: string[];
  phrasesBanned?: string[];
  audienceNotes?: string;
  brandStoryNotes?: string;
  emailGuidelines?: string;
  otherInsights?: string[];
};

type DocumentApi = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string | null;
  rawTextLength: number;
  summary: string | null;
  brandInsights: BrandInsights | null;
  status: string;
  appliedToProfile: boolean;
  error: string | null;
  createdAt: string;
};

type DocumentsResponse = {
  documents: DocumentApi[];
  stats: { totalDocuments: number; completedAnalyses: number };
};

type ToastItem = { id: number; kind: "success" | "error" | "info"; message: string };

type AnalysisResult = {
  documentId: string;
  fileName: string;
  fileType: string;
  summary: string;
  brandInsights: BrandInsights;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIdx]}`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function FileTypeIcon({ type }: { type: string }) {
  const t = type.toLowerCase();
  const color = t === "pdf" ? "text-red-300" : t === "docx" ? "text-blue-300" : "text-emerald-300";
  return <FileText className={`h-5 w-5 ${color}`} />;
}

function TagList({ items, variant }: { items: string[]; variant: "green" | "red" | "blue" }) {
  const styles =
    variant === "green"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
      : variant === "red"
        ? "border-red-400/30 bg-red-400/10 text-red-100"
        : "border-sky-400/30 bg-sky-400/10 text-sky-100";
  if (!items.length) return <p className="text-xs text-zinc-500">None found</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className={`inline-flex rounded-full border px-2 py-1 text-xs ${styles}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

function AnalysisResultCard({
  result,
  onApply,
  applying,
  applySections,
  setApplySections,
  onDismiss,
}: {
  result: AnalysisResult;
  onApply: () => void;
  applying: boolean;
  applySections: { rules: boolean; ctas: boolean; phrases: boolean };
  setApplySections: React.Dispatch<
    React.SetStateAction<{ rules: boolean; ctas: boolean; phrases: boolean }>
  >;
  onDismiss: () => void;
}) {
  const b = result.brandInsights;
  const [open, setOpen] = useState(true);

  return (
    <Card className="border-white/10">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <FileTypeIcon type={result.fileType} />
          <div>
            <CardTitle className="text-base">{result.fileName}</CardTitle>
            <CardDescription>AI analysis complete</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button type="button" variant="ghost" className="h-8 px-2" onClick={onDismiss} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      {open ? (
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-indigo-400/25 bg-indigo-400/10 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-200/90">Summary</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-100">{result.summary}</p>
          </div>

          {b.voiceNotes ? (
            <div>
              <p className="text-xs font-medium text-zinc-400">Voice notes</p>
              <p className="mt-1 text-sm text-zinc-200">{b.voiceNotes}</p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-emerald-300/90">Do&apos;s found</p>
              <div className="mt-2">
                <TagList items={b.dosFound ?? []} variant="green" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-red-300/90">Don&apos;ts found</p>
              <div className="mt-2">
                <TagList items={b.dontsFound ?? []} variant="red" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-sky-300/90">CTAs found</p>
              <div className="mt-2">
                <TagList items={b.ctasFound ?? []} variant="blue" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-emerald-300/90">Preferred phrases</p>
              <div className="mt-2">
                <TagList items={b.phrasesPreferred ?? []} variant="green" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-red-300/90">Banned phrases</p>
              <div className="mt-2">
                <TagList items={b.phrasesBanned ?? []} variant="red" />
              </div>
            </div>
          </div>

          {b.audienceNotes ? (
            <div>
              <p className="text-xs font-medium text-zinc-400">Audience</p>
              <p className="mt-1 text-sm text-zinc-200">{b.audienceNotes}</p>
            </div>
          ) : null}
          {b.emailGuidelines ? (
            <div>
              <p className="text-xs font-medium text-zinc-400">Email guidelines</p>
              <p className="mt-1 text-sm text-zinc-200">{b.emailGuidelines}</p>
            </div>
          ) : null}
          {b.brandStoryNotes ? (
            <div>
              <p className="text-xs font-medium text-zinc-400">Brand story</p>
              <p className="mt-1 text-sm text-zinc-200">{b.brandStoryNotes}</p>
            </div>
          ) : null}
          {b.otherInsights?.length ? (
            <div>
              <p className="text-xs font-medium text-zinc-400">Other insights</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-200">
                {b.otherInsights.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-xs font-medium text-zinc-400">Apply to Brand Profile</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-zinc-200">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-indigo-400"
                  checked={applySections.rules}
                  onChange={(e) => setApplySections((s) => ({ ...s, rules: e.target.checked }))}
                />
                Rules (do&apos;s / don&apos;ts)
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-indigo-400"
                  checked={applySections.ctas}
                  onChange={(e) => setApplySections((s) => ({ ...s, ctas: e.target.checked }))}
                />
                CTAs
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-indigo-400"
                  checked={applySections.phrases}
                  onChange={(e) => setApplySections((s) => ({ ...s, phrases: e.target.checked }))}
                />
                Phrases
              </label>
            </div>
            <Button
              type="button"
              className="mt-4"
              disabled={applying || !Object.values(applySections).some(Boolean)}
              onClick={onApply}
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Apply selected to Brand Profile
            </Button>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

export default function BrainDocumentsPage() {
  const { data, mutate, isLoading } = useSWR<DocumentsResponse>("/api/brain/documents", fetcher);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [queueBusy, setQueueBusy] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [recentResults, setRecentResults] = useState<AnalysisResult[]>([]);
  const [applySectionsByDoc, setApplySectionsByDoc] = useState<
    Record<string, { rules: boolean; ctas: boolean; phrases: boolean }>
  >({});
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [expandedLib, setExpandedLib] = useState<Record<string, boolean>>({});
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toastIdRef = useRef(0);
  function pushToast(kind: ToastItem["kind"], message: string) {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }

  const documents = data?.documents ?? [];
  const stats = data?.stats;

  const statusVariant = (status: string): "success" | "warning" | "destructive" | "outline" => {
    if (status === "completed") return "success";
    if (status === "failed") return "destructive";
    if (status === "processing" || status === "uploaded") return "warning";
    return "outline";
  };

  const processFile = useCallback(
    async (file: File) => {
      setCurrentStep("Uploading & extracting text...");
      const form = new FormData();
      form.append("file", file);

      const uploadRes = await fetch("/api/brain/documents/upload", {
        method: "POST",
        body: form,
      });
      const uploadJson = (await uploadRes.json().catch(() => ({}))) as {
        documentId?: string;
        fileName?: string;
        fileType?: string;
        textPreview?: string;
        error?: string;
      };
      if (!uploadRes.ok) {
        throw new Error(uploadJson.error || "Upload failed");
      }
      if (!uploadJson.documentId) throw new Error("No document id returned");

      setCurrentStep("AI analyzing document...");
      const analyzeRes = await fetch("/api/brain/documents/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: uploadJson.documentId }),
      });
      const analyzeJson = (await analyzeRes.json().catch(() => ({}))) as {
        summary?: string;
        brandInsights?: BrandInsights;
        error?: string;
        step?: string;
      };
      if (!analyzeRes.ok) {
        throw new Error(
          analyzeJson.step ? `[${analyzeJson.step}] ${analyzeJson.error}` : analyzeJson.error || "Analysis failed",
        );
      }

      const result: AnalysisResult = {
        documentId: uploadJson.documentId,
        fileName: uploadJson.fileName || file.name,
        fileType: uploadJson.fileType || "txt",
        summary: analyzeJson.summary ?? "",
        brandInsights: analyzeJson.brandInsights ?? {},
      };

      setRecentResults((prev) => [result, ...prev.filter((r) => r.documentId !== result.documentId)]);
      setApplySectionsByDoc((prev) => ({
        ...prev,
        [result.documentId]: prev[result.documentId] ?? { rules: true, ctas: true, phrases: true },
      }));
      await mutate();
      pushToast("success", `Analyzed "${result.fileName}"`);
    },
    [mutate],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      setQueueBusy(true);
      setCurrentStep(null);
      for (const file of list) {
        try {
          await processFile(file);
        } catch (e) {
          pushToast("error", e instanceof Error ? e.message : "Processing failed");
        }
      }
      setQueueBusy(false);
      setCurrentStep(null);
    },
    [processFile],
  );

  async function applyDocument(documentId: string) {
    const sections = applySectionsByDoc[documentId] ?? { rules: true, ctas: true, phrases: true };
    const payloadSections: Array<"rules" | "ctas" | "phrases"> = [];
    if (sections.rules) payloadSections.push("rules");
    if (sections.ctas) payloadSections.push("ctas");
    if (sections.phrases) payloadSections.push("phrases");
    if (!payloadSections.length) {
      pushToast("info", "Select at least one category to apply.");
      return;
    }
    setApplyingId(documentId);
    try {
      const res = await fetch("/api/brain/documents/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, sections: payloadSections }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; counts?: { rulesAdded: number; ctasAdded: number; phrasesAdded: number } };
      if (!res.ok) throw new Error(json.error || "Apply failed");
      const c = json.counts;
      pushToast(
        "success",
        `Added ${c?.rulesAdded ?? 0} rules, ${c?.ctasAdded ?? 0} CTAs, ${c?.phrasesAdded ?? 0} phrases.`,
      );
    } catch (e) {
      pushToast("error", e instanceof Error ? e.message : "Apply failed");
    } finally {
      setApplyingId(null);
    }
  }

  async function deleteDocument(id: string) {
    if (!confirm("Delete this document permanently?")) return;
    try {
      const res = await fetch(`/api/brain/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Delete failed");
      setRecentResults((prev) => prev.filter((r) => r.documentId !== id));
      await mutate();
      pushToast("success", "Document deleted.");
    } catch (e) {
      pushToast("error", e instanceof Error ? e.message : "Delete failed");
    }
  }

  const summaryLine = useMemo(() => {
    const total = stats?.totalDocuments ?? documents.length;
    const insights = stats?.completedAnalyses ?? documents.filter((d) => d.status === "completed").length;
    return `${total} document${total === 1 ? "" : "s"} uploaded, ${insights} insight${insights === 1 ? "" : "s"} extracted`;
  }, [stats, documents]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-100">
          <BookOpen className="h-6 w-6 text-indigo-300" />
          Brand Documents
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Upload brand guidelines, style guides, or any document. The AI reads them and learns your brand.
        </p>
        <p className="mt-2 text-xs text-zinc-500">{summaryLine}</p>
      </div>

      {toasts.length > 0 ? (
        <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={
                t.kind === "success"
                  ? "rounded-lg border border-emerald-400/30 bg-emerald-950/90 px-4 py-3 text-sm text-emerald-50 shadow-lg"
                  : t.kind === "error"
                    ? "rounded-lg border border-red-400/30 bg-red-950/90 px-4 py-3 text-sm text-red-50 shadow-lg"
                    : "rounded-lg border border-sky-400/30 bg-sky-950/90 px-4 py-3 text-sm text-sky-50 shadow-lg"
              }
            >
              {t.message}
            </div>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>PDF, DOCX, or TXT — max 10MB per file. Multiple files are processed one after another.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 transition-colors ${
              dragOver ? "border-indigo-400/60 bg-indigo-400/10" : "border-white/15 bg-white/[0.02] hover:border-white/25"
            }`}
          >
            <UploadCloud className="mb-3 h-10 w-10 text-zinc-400" />
            <p className="text-sm font-medium text-zinc-200">Drop files here or click to browse</p>
            <p className="mt-1 text-xs text-zinc-500">PDF, DOCX, TXT · max 10MB each</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              Browse files
            </Button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              multiple
              onChange={(e) => {
                if (e.target.files?.length) void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {queueBusy ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-300" />
              <span>{currentStep ?? "Working..."}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {recentResults.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-100">Latest analysis</h2>
          {recentResults.map((r) => (
            <AnalysisResultCard
              key={r.documentId}
              result={r}
              applying={applyingId === r.documentId}
              applySections={
                applySectionsByDoc[r.documentId] ?? { rules: true, ctas: true, phrases: true }
              }
              setApplySections={(updater) =>
                setApplySectionsByDoc((prev) => {
                  const cur = prev[r.documentId] ?? { rules: true, ctas: true, phrases: true };
                  const next = typeof updater === "function" ? updater(cur) : updater;
                  return { ...prev, [r.documentId]: next };
                })
              }
              onApply={() => void applyDocument(r.documentId)}
              onDismiss={() => setRecentResults((prev) => prev.filter((x) => x.documentId !== r.documentId))}
            />
          ))}
        </div>
      ) : null}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-zinc-100">Document library</h2>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : documents.length === 0 ? (
          <Card className="border-dashed border-white/15">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <AlertCircle className="mb-2 h-8 w-8 text-zinc-500" />
              <p className="text-sm text-zinc-400">
                No documents uploaded yet. Upload brand guidelines to teach the AI your brand.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {documents.map((doc) => {
              const expanded = expandedLib[doc.id] ?? false;
              const insights = doc.brandInsights;
              return (
                <Card key={doc.id} className="border-white/10">
                  <CardHeader className="flex flex-row items-start justify-between gap-2">
                    <div className="flex gap-3">
                      <FileTypeIcon type={doc.fileType} />
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{doc.fileName}</CardTitle>
                        <CardDescription>
                          {doc.fileType.toUpperCase()} · {formatBytes(doc.fileSize)} · {formatDate(doc.createdAt)}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={statusVariant(doc.status)}>{doc.status}</Badge>
                      {doc.appliedToProfile ? (
                        <Badge variant="success" className="text-[10px]">
                          Applied
                        </Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {doc.summary ? (
                      <p className="line-clamp-2 text-sm text-zinc-300">{doc.summary}</p>
                    ) : (
                      <p className="text-sm text-zinc-500">No summary yet.</p>
                    )}
                    {doc.error ? <p className="text-xs text-red-300">{doc.error}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 px-3 text-xs"
                        onClick={() => setExpandedLib((prev) => ({ ...prev, [doc.id]: !expanded }))}
                      >
                        {expanded ? "Hide details" : "View details"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 px-2 text-red-300 hover:text-red-200"
                        onClick={() => void deleteDocument(doc.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                    {expanded && doc.status === "completed" && insights ? (
                      <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm">
                        {insights.voiceNotes ? (
                          <div>
                            <p className="text-xs text-zinc-500">Voice</p>
                            <p className="text-zinc-200">{insights.voiceNotes}</p>
                          </div>
                        ) : null}
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="text-xs text-emerald-400/90">Do&apos;s</p>
                            <TagList items={insights.dosFound ?? []} variant="green" />
                          </div>
                          <div>
                            <p className="text-xs text-red-400/90">Don&apos;ts</p>
                            <TagList items={insights.dontsFound ?? []} variant="red" />
                          </div>
                        </div>
                        <div className="rounded-lg border border-white/10 p-3">
                          <p className="text-xs text-zinc-500">Apply from this document</p>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-200">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="accent-indigo-400"
                                checked={(applySectionsByDoc[doc.id] ?? { rules: true, ctas: true, phrases: true }).rules}
                                onChange={(e) =>
                                  setApplySectionsByDoc((prev) => ({
                                    ...prev,
                                    [doc.id]: {
                                      ...(prev[doc.id] ?? { rules: true, ctas: true, phrases: true }),
                                      rules: e.target.checked,
                                    },
                                  }))
                                }
                              />
                              Rules
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="accent-indigo-400"
                                checked={(applySectionsByDoc[doc.id] ?? { rules: true, ctas: true, phrases: true }).ctas}
                                onChange={(e) =>
                                  setApplySectionsByDoc((prev) => ({
                                    ...prev,
                                    [doc.id]: {
                                      ...(prev[doc.id] ?? { rules: true, ctas: true, phrases: true }),
                                      ctas: e.target.checked,
                                    },
                                  }))
                                }
                              />
                              CTAs
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="accent-indigo-400"
                                checked={(applySectionsByDoc[doc.id] ?? { rules: true, ctas: true, phrases: true }).phrases}
                                onChange={(e) =>
                                  setApplySectionsByDoc((prev) => ({
                                    ...prev,
                                    [doc.id]: {
                                      ...(prev[doc.id] ?? { rules: true, ctas: true, phrases: true }),
                                      phrases: e.target.checked,
                                    },
                                  }))
                                }
                              />
                              Phrases
                            </label>
                          </div>
                          <Button
                            type="button"
                            className="mt-3 h-8 px-3 text-xs"
                            disabled={applyingId === doc.id}
                            onClick={() => void applyDocument(doc.id)}
                          >
                            {applyingId === doc.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            Apply to Brand Profile
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
