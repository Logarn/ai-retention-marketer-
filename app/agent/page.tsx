"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, Loader2, Paperclip, Plus, SendHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { THINKING_MESSAGES } from "@/lib/agent/worklin";
import { analyzeAndApplyStore } from "@/lib/store-analyzer";

type ChatMsg = {
  id: string;
  role: string;
  content: string;
  messageType: string;
  metadata: string | null;
  createdAt: string;
};

type Session = {
  id: string;
  title: string | null;
  status: string;
  currentStep: number;
  messages: ChatMsg[];
};

function parseChips(metadata: string | null): string[] {
  if (!metadata) return [];
  try {
    const m = JSON.parse(metadata) as { chips?: string[] };
    return Array.isArray(m.chips) ? m.chips : [];
  } catch {
    return [];
  }
}

export default function AgentPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [thinkingLine, setThinkingLine] = useState(0);
  const [input, setInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thinkingRotateRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [session?.messages, thinking, scrollToBottom]);

  useEffect(() => {
    if (!thinking) {
      if (thinkingRotateRef.current) {
        clearInterval(thinkingRotateRef.current);
        thinkingRotateRef.current = null;
      }
      return;
    }
    thinkingRotateRef.current = setInterval(() => {
      setThinkingLine((i) => (i + 1) % THINKING_MESSAGES.length);
    }, 2500);
    return () => {
      if (thinkingRotateRef.current) clearInterval(thinkingRotateRef.current);
    };
  }, [thinking]);

  const loadLatest = useCallback(async () => {
    const res = await fetch("/api/agent/sessions?latest=1");
    const data = (await res.json()) as { session: Session | null };
    if (data.session) {
      setSession(data.session);
      return data.session;
    }
    const create = await fetch("/api/agent/sessions", { method: "POST" });
    const created = (await create.json()) as { session: Session };
    setSession(created.session);
    return created.session;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (!cancelled) await loadLatest();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLatest]);

  async function runStoreAnalyzerFlow(url: string, sid: string) {
    setThinking(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { analysisData } = await analyzeAndApplyStore(url, origin);

      const chatRes = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          message: "",
          payload: {
            kind: "store_analysis",
            analysisData: analysisData as unknown as Record<string, unknown>,
            alreadyApplied: true,
          },
        }),
      });
      const chatJson = (await chatRes.json()) as { session?: Session; error?: string };
      if (!chatRes.ok) throw new Error(chatJson.error || "Failed to save analysis");
      if (chatJson.session) setSession(chatJson.session);
    } catch (e) {
      const errMsg =
        e instanceof Error ? e.message : "Something broke during the site scan. Try again or paste a different URL.";
      setToast(`Store scan: ${errMsg}`);
      window.setTimeout(() => setToast(null), 6000);
    } finally {
      setThinking(false);
    }
  }

  async function sendChat(body: {
    message: string;
    payload?: { kind: string; analysisData?: Record<string, unknown>; alreadyApplied?: boolean };
  }) {
    if (!session) return;
    setSending(true);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, ...body }),
      });
      const data = (await res.json()) as {
        session?: Session;
        clientAction?: { type: string; url?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Request failed");
      if (data.session) setSession(data.session);

      if (data.clientAction?.type === "run_store_analyzer" && data.clientAction.url) {
        void runStoreAnalyzerFlow(data.clientAction.url, session.id);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || !session || sending || thinking) return;
    setInput("");
    await sendChat({ message: text });
  }

  async function onChipClick(chip: string) {
    if (!session || sending || thinking) return;
    await sendChat({ message: chip });
  }

  async function newChat() {
    setLoading(true);
    try {
      const res = await fetch("/api/agent/sessions", { method: "POST" });
      const data = (await res.json()) as { session: Session };
      setSession(data.session);
    } finally {
      setLoading(false);
    }
  }

  async function onFileSelected(files: FileList | null) {
    if (!files?.length || !session || session.currentStep !== 6) return;
    setThinking(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const up = await fetch("/api/brain/documents/upload", { method: "POST", body: form });
        const upJson = (await up.json()) as { documentId?: string; error?: string };
        if (!up.ok || !upJson.documentId) throw new Error(upJson.error || "Upload failed");
        const an = await fetch("/api/brain/documents/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: upJson.documentId }),
        });
        if (!an.ok) throw new Error("Document analysis failed");
      }
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, message: "", payload: { kind: "documents_done" } }),
      });
      const data = (await res.json()) as { session?: Session };
      if (data.session) setSession(data.session);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Upload failed");
      window.setTimeout(() => setToast(null), 5000);
    } finally {
      setThinking(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (loading && !session) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-300" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-2rem)] flex-1 flex-col bg-[#0a0e14] md:min-h-screen">
      {toast ? (
        <div className="fixed bottom-24 right-4 z-50 max-w-sm rounded-lg border border-red-400/30 bg-red-950/95 px-4 py-3 text-sm text-red-50 shadow-lg md:bottom-8">
          {toast}
        </div>
      ) : null}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/30 to-orange-500/20 text-lg">
            ✨
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-zinc-100">Worklin</h1>
            <p className="text-[11px] text-zinc-500">Retention marketing agent</p>
          </div>
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
          <Link
            href="/brain/learned"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-violet-400/35 bg-violet-500/10 px-3 text-xs font-semibold text-violet-100 transition-colors hover:bg-violet-500/20"
          >
            <Brain className="h-4 w-4 text-violet-300" />
            My Brain
          </Link>
          <Button type="button" variant="outline" className="h-9 gap-2 text-xs" onClick={() => void newChat()}>
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {(session?.messages ?? []).map((m) => {
            const isUser = m.role === "user";
            const chips = m.messageType === "chips" ? parseChips(m.metadata) : [];
            const last = session?.messages[session.messages.length - 1];
            const showChips =
              chips.length > 0 && last?.id === m.id && m.role === "agent" && m.messageType === "chips" && !thinking;

            return (
              <div
                key={m.id}
                className={`flex animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                  isUser ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? "bg-gradient-to-br from-orange-500/25 to-indigo-500/20 text-zinc-100 ring-1 ring-white/10"
                      : m.messageType === "thinking"
                        ? "border border-indigo-400/20 bg-indigo-500/10 text-zinc-200"
                        : "bg-white/[0.06] text-zinc-100 ring-1 ring-white/10"
                  }`}
                >
                  {!isUser && m.messageType !== "thinking" ? (
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-indigo-300/90">
                      <Sparkles className="h-3.5 w-3.5" /> Worklin
                    </div>
                  ) : null}
                  {m.messageType === "analysis_result" ? (
                    <div className="whitespace-pre-wrap text-zinc-200">{m.content}</div>
                  ) : (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  )}
                  {showChips ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {chips.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => void onChipClick(c)}
                          className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-orange-400/40 hover:bg-white/10"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {thinking ? (
            <div className="flex justify-start animate-in fade-in">
              <div className="max-w-[92%] rounded-2xl border border-indigo-400/25 bg-indigo-500/10 px-4 py-3 text-sm text-zinc-200 shadow-[0_0_30px_-12px_rgba(99,102,241,0.5)]">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-indigo-300/90">
                  <Sparkles className="h-3.5 w-3.5" /> Worklin
                </div>
                <p className="animate-pulse text-zinc-200">{THINKING_MESSAGES[thinkingLine]}</p>
                <p className="mt-2 text-lg tracking-widest text-zinc-500">
                  <span className="inline-block animate-bounce">.</span>
                  <span className="inline-block animate-bounce [animation-delay:150ms]">.</span>
                  <span className="inline-block animate-bounce [animation-delay:300ms]">.</span>
                </p>
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="shrink-0 border-t border-white/10 bg-[#080c11]/95 px-4 py-3 backdrop-blur md:px-8"
      >
        <div className="mx-auto flex max-w-3xl gap-2">
          {session && session.status === "onboarding" && session.currentStep === 6 ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.docx,.txt"
                onChange={(e) => void onFileSelected(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 w-11 shrink-0 p-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || thinking}
                aria-label="Upload document"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </>
          ) : null}
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Worklin..."
            disabled={sending || thinking}
            className="h-11 flex-1 border-white/15 bg-white/[0.06] text-zinc-100 placeholder:text-zinc-500"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
          />
          <Button type="submit" className="h-11 w-11 shrink-0 p-0" disabled={sending || thinking || !input.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-zinc-600">
          Store scans run in your browser (fast, no timeouts). See everything Worklin has saved in{" "}
          <Link href="/brain/learned" className="font-semibold text-violet-300 underline-offset-2 hover:underline">
            My Brain
          </Link>{" "}
          or edit{" "}
          <Link href="/brain/profile" className="text-indigo-400 underline-offset-2 hover:underline">
            Brand Profile
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
