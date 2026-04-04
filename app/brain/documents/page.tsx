"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, FileText, Loader2, UploadCloud, Wand2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type DocumentItem = {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  fileSize: number;
  documentType: string | null;
  extractionStatus: string;
  extractedAt: string | null;
  appliedToBrand: boolean;
  conflictsFound: unknown;
  createdAt: string;
  updatedAt: string;
};

type DocumentsResponse = {
  documents: DocumentItem[];
  counts: {
    total: number;
    pending: number;
    processing: number;
    complete: number;
    failed: number;
    applied: number;
  };
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

export default function BrainDocumentsPage() {
  const { data, mutate, isLoading } = useSWR<DocumentsResponse>("/api/brain/documents", fetcher);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRunningAction, setIsRunningAction] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fileName: "",
    fileType: "pdf",
    fileUrl: "",
    fileSize: "0",
    documentType: "brand-guidelines",
  });

  const recentDocuments = useMemo(
    () => (data?.documents ?? []).slice(0, 8),
    [data?.documents],
  );

  async function handleUploadStub() {
    setIsSubmitting(true);
    setNotice(null);
    setError(null);
    try {
      const payload = {
        fileName: form.fileName.trim(),
        fileType: form.fileType.trim(),
        fileUrl: form.fileUrl.trim(),
        fileSize: Number(form.fileSize) || 0,
        documentType: form.documentType.trim() || null,
      };

      const response = await fetch("/api/brain/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(json.error || "Failed to register document");
      setNotice("Document added. You can now extract and apply rules.");
      setForm((prev) => ({ ...prev, fileName: "", fileUrl: "", fileSize: "0" }));
      await mutate();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runAction(documentId: string, action: "extract" | "apply" | "delete") {
    setIsRunningAction(true);
    setNotice(null);
    setError(null);
    try {
      const endpoint =
        action === "extract"
          ? `/api/brain/documents/${documentId}/extract`
          : action === "apply"
            ? `/api/brain/documents/${documentId}/apply`
            : `/api/brain/documents?id=${documentId}`;

      const response = await fetch(endpoint, {
        method: action === "delete" ? "DELETE" : "POST",
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(json.error || `Failed to ${action} document`);
      setNotice(
        action === "extract"
          ? "Extraction completed."
          : action === "apply"
            ? "Extracted rules applied to Brand Brain."
            : "Document removed.",
      );
      await mutate();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed");
    } finally {
      setIsRunningAction(false);
    }
  }

  function statusVariant(status: string): "warning" | "outline" | "success" | "destructive" {
    if (status === "complete") return "success";
    if (status === "failed") return "destructive";
    if (status === "processing") return "warning";
    return "outline";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-100">
          <FileText className="h-5 w-5 text-indigo-300" />
          Document Intelligence
        </h1>
        <p className="text-sm text-zinc-400">
          Upload brand docs, extract rules, review conflicts, and apply intelligence to the Brain.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total docs" value={data?.counts.total ?? 0} />
        <StatCard label="Extracted" value={data?.counts.complete ?? 0} />
        <StatCard label="Applied" value={data?.counts.applied ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload (stub)</CardTitle>
          <CardDescription>
            Phase shell: register file metadata now; storage + parser workers come next.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input
            placeholder="File name (e.g. Brand_Guidelines_2024.pdf)"
            value={form.fileName}
            onChange={(event) => setForm((prev) => ({ ...prev, fileName: event.target.value }))}
          />
          <Input
            placeholder="File type (pdf, docx, notion, gdoc, image)"
            value={form.fileType}
            onChange={(event) => setForm((prev) => ({ ...prev, fileType: event.target.value }))}
          />
          <Input
            placeholder="File URL"
            value={form.fileUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, fileUrl: event.target.value }))}
          />
          <Input
            placeholder="Document type (brand-guidelines, legal, etc.)"
            value={form.documentType}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, documentType: event.target.value }))
            }
          />
          <Input
            placeholder="File size (bytes)"
            value={form.fileSize}
            onChange={(event) => setForm((prev) => ({ ...prev, fileSize: event.target.value }))}
          />
          <div className="flex items-center justify-end">
            <Button onClick={() => void handleUploadStub()} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              Add Document
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Documents</CardTitle>
          <CardDescription>
            Trigger extraction and apply workflows with conflict visibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-zinc-400">Loading documents...</p>
          ) : null}

          {!isLoading && !recentDocuments.length ? (
            <p className="text-sm text-zinc-400">
              No documents yet. Add your first guideline or style doc above.
            </p>
          ) : null}

          {recentDocuments.map((doc) => (
            <div
              key={doc.id}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-100">{doc.fileName}</p>
                  <p className="text-xs text-zinc-400">
                    {doc.documentType || "unspecified"} · {doc.fileType} · {formatBytes(doc.fileSize)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(doc.extractionStatus)}>{doc.extractionStatus}</Badge>
                    {doc.appliedToBrand ? (
                      <Badge variant="success">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        applied
                      </Badge>
                    ) : null}
                    {doc.conflictsFound ? <Badge variant="warning">conflicts detected</Badge> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void runAction(doc.id, "extract")}
                    disabled={isRunningAction}
                  >
                    <Wand2 className="h-4 w-4" />
                    Extract
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void runAction(doc.id, "apply")}
                    disabled={isRunningAction || doc.extractionStatus !== "complete"}
                  >
                    Apply
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void runAction(doc.id, "delete")}
                    disabled={isRunningAction}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {doc.extractedAt ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Extracted at {new Date(doc.extractedAt).toLocaleString()}
                </p>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      {notice ? <p className="text-xs text-emerald-300">{notice}</p> : null}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-zinc-400">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-zinc-100">{value}</p>
      </CardContent>
    </Card>
  );
}
