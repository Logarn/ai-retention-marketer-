"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DefaultChatTransport,
  getToolName,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  type UIMessage,
} from "ai";
import { useChat } from "@ai-sdk/react";
import ReactMarkdown from "react-markdown";
import { Brain, ChevronDown, Loader2, Paperclip, Plus, SendHorizontal, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type DbMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

type ChatSession = {
  id: string;
  title: string | null;
  status: string;
  messages: DbMessage[];
};

const TOOL_LABELS: Record<string, string> = {
  getBrandProfile: "Getting brand profile",
  updateBrandProfile: "Updating brand profile",
  analyzeStore: "Analyzing store",
  generateEmailContent: "Generating email",
  analyzeDocument: "Analyzing document",
  findCompetitors: "Finding competitors",
  analyzeCompetitorSite: "Analyzing competitor site",
  analyzeCompetitorEmail: "Analyzing competitor email",
  getCustomerStats: "Loading customer stats",
  searchBrandDocuments: "Searching brand documents",
};

const THINKING_ROTATION = [
  "Stalking your brand (professionally)...",
  "Consulting the marketing gods...",
  "Crunching some seriously sexy data...",
  "Making your competitors nervous...",
  "Downloading marketing genius...",
  "Having a eureka moment...",
  "My neurons are firing...",
  "Brewing up something good...",
];

function mapDbRoleToUi(role: string): "user" | "assistant" {
  if (role === "user") return "user";
  return "assistant";
}

function messagesFromDb(rows: DbMessage[]): UIMessage[] {
  return rows.map((m) => ({
    id: m.id,
    role: mapDbRoleToUi(m.role),
    parts: [{ type: "text" as const, text: m.content, state: "done" as const }],
  }));
}

/** Collect visible text from any message part (text, reasoning, tool output fallbacks). */
function getRenderableTextParts(parts: UIMessage["parts"]): Array<{ key: string; text: string; kind: "text" | "reasoning" }> {
  const out: Array<{ key: string; text: string; kind: "text" | "reasoning" }> = [];
  let i = 0;
  for (const part of parts) {
    const p = part as { type?: string; text?: string };
    if (isTextUIPart(part as never) && p.text) {
      out.push({ key: `t-${i}`, text: p.text, kind: "text" });
    } else if (isReasoningUIPart(part as never) && p.text) {
      out.push({ key: `r-${i}`, text: p.text, kind: "reasoning" });
    }
    i += 1;
  }
  return out;
}

function toolLineFromPart(part: unknown): string | null {
  if (!isToolUIPart(part as never)) return null;
  const name = getToolName(part as never);
  const label = TOOL_LABELS[name] ?? name.replace(/([A-Z])/g, " $1").trim();
  const p = part as { state?: string };
  if (p.state === "input-streaming" || p.state === "input-available") {
    return `🔧 ${label}...`;
  }
  if (p.state === "output-available") {
    return `🔧 ${label} — done`;
  }
  if (p.state === "output-error") {
    return `🔧 ${label} — error`;
  }
  return `🔧 ${label}...`;
}

function AgentChatPanel({
  session,
  onSessionChange,
  sessions,
  onReloadSessions,
}: {
  session: ChatSession;
  onSessionChange: (s: ChatSession) => void;
  sessions: Array<{ id: string; title: string | null; updatedAt: string }>;
  onReloadSessions: () => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent/chat",
        prepareSendMessagesRequest: async ({ body }) => ({
          body: {
            ...(body ?? {}),
            sessionId: session.id,
          },
        }),
      }),
    [session.id],
  );

  const initialMessages = useMemo(() => messagesFromDb(session.messages), [session]);

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: session.id,
    transport,
    messages: initialMessages,
    onError: (error) => {
      console.error("Chat error:", error);
      setToast(error.message ?? "Something went wrong. Check the console or try again.");
      window.setTimeout(() => setToast(null), 8000);
    },
    onFinish: async () => {
      try {
        const res = await fetch(`/api/agent/sessions/${session.id}`);
        if (!res.ok) return;
        const data = (await res.json()) as { session: ChatSession };
        setMessages(messagesFromDb(data.session.messages));
      } catch {
        // ignore sync errors
      }
    },
  });

  console.log("Messages:", messages);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (status !== "streaming" && status !== "submitted") return;
    const t = window.setInterval(() => {
      setThinkingIdx((i) => (i + 1) % THINKING_ROTATION.length);
    }, 2500);
    return () => clearInterval(t);
  }, [status]);

  const busy = status === "streaming" || status === "submitted";

  async function handleNewChat() {
    const res = await fetch("/api/agent/sessions", { method: "POST" });
    const data = (await res.json()) as { session: ChatSession };
    onSessionChange(data.session);
    await onReloadSessions();
    setPickerOpen(false);
  }

  async function loadSession(id: string) {
    const res = await fetch(`/api/agent/sessions/${id}`);
    const data = (await res.json()) as { session: ChatSession };
    onSessionChange(data.session);
    setPickerOpen(false);
  }

  async function deleteSession(id: string) {
    if (!confirm("Delete this chat?")) return;
    const res = await fetch(`/api/agent/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    if (session.id === id) {
      await handleNewChat();
    } else {
      await onReloadSessions();
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await sendMessage({ text });
  }

  async function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length || busy) return;
    const file = files[0];
    e.target.value = "";
    try {
      const text = await file.text();
      const intro = `Please analyze this document using your tools.\nFile: ${file.name}\n\n${text.slice(0, 120_000)}`;
      await sendMessage({ text: intro });
    } catch {
      setToast("Could not read file");
      window.setTimeout(() => setToast(null), 4000);
    }
  }

  return (
    <>
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/20">
            <Sparkles className="h-5 w-5 text-indigo-300" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">Worklin</h1>
            <p className="text-xs text-zinc-500">Autonomous retention marketer</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-1 border-white/15 text-xs"
              onClick={() => setPickerOpen((v) => !v)}
            >
              Chats <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
            {pickerOpen ? (
              <div className="absolute right-0 z-20 mt-1 max-h-72 w-64 overflow-auto rounded-lg border border-white/10 bg-zinc-900 py-1 shadow-xl">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-white/5"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-zinc-200"
                      onClick={() => void loadSession(s.id)}
                    >
                      {s.title || "New Chat"}
                    </button>
                    <button
                      type="button"
                      className="text-zinc-500 hover:text-red-400"
                      aria-label="Delete chat"
                      onClick={() => void deleteSession(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <Link
            href="/brain/learned"
            className="inline-flex h-9 items-center rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-zinc-100 hover:bg-white/10"
          >
            My Brain
          </Link>
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-1 border-white/15 text-xs"
            onClick={() => void handleNewChat()}
          >
            <Plus className="h-3.5 w-3.5" /> New Chat
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((m) => {
            const isUser = m.role === "user";
            return (
              <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm ${
                    isUser ? "bg-indigo-600/25 text-zinc-100" : "border border-white/10 bg-white/[0.03] text-zinc-100"
                  }`}
                >
                  {!isUser ? (
                    <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
                      <Brain className="h-3.5 w-3.5 text-indigo-400" />
                      Worklin
                    </div>
                  ) : null}
                  {(() => {
                    const textBlocks = getRenderableTextParts(m.parts);
                    if (m.role === "assistant" && textBlocks.length === 0) {
                      const raw = m.parts
                        .map((part) => {
                          const any = part as { type?: string; text?: string; output?: unknown };
                          if (typeof any.text === "string" && any.text) return any.text;
                          return "";
                        })
                        .filter(Boolean)
                        .join("\n");
                      if (raw) {
                        return (
                          <div key="fallback" className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
                            {raw}
                          </div>
                        );
                      }
                    }
                    return (
                      <>
                        {textBlocks.map((block) => (
                          <div
                            key={block.key}
                            className={
                              block.kind === "reasoning"
                                ? "mt-2 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-zinc-400 italic"
                                : "prose prose-invert prose-sm max-w-none"
                            }
                          >
                            {block.kind === "text" ? (
                              <ReactMarkdown>{block.text}</ReactMarkdown>
                            ) : (
                              <span className="whitespace-pre-wrap">{block.text}</span>
                            )}
                          </div>
                        ))}
                        {m.parts.map((part, i) => {
                          const toolLine = toolLineFromPart(part);
                          if (!toolLine) return null;
                          return (
                            <p key={`tool-${i}`} className="mt-2 text-xs text-zinc-500">
                              {toolLine}
                            </p>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })}
          {busy ? (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
                <p className="animate-pulse text-xs">{THINKING_ROTATION[thinkingIdx]}</p>
                <p className="mt-2 text-lg leading-none tracking-widest text-zinc-500">•••</p>
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-red-500/90 px-4 py-2 text-xs text-white">
          {toast}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="shrink-0 border-t border-white/10 bg-zinc-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-2">
          <input ref={fileRef} type="file" className="hidden" accept=".txt,.md,.pdf,.doc,.docx" onChange={onFilePick} />
          <Button
            type="button"
            variant="ghost"
            className="shrink-0 text-zinc-400 hover:text-zinc-200"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            aria-label="Upload document"
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Worklin..."
            rows={1}
            className="min-h-[40px] flex-1 resize-none rounded-md border border-white/15 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 disabled:opacity-50"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSubmit(e);
              }
            }}
          />
          {busy ? (
            <Button type="button" variant="outline" className="shrink-0 border-white/15" onClick={() => void stop()}>
              Stop
            </Button>
          ) : (
            <Button type="submit" className="shrink-0 gap-1 bg-indigo-600 hover:bg-indigo-500">
              <SendHorizontal className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-zinc-600">
          Shift+Enter for newline · Paste long text or upload a file for document analysis
        </p>
      </form>
    </>
  );
}

export default function AgentPage() {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string | null; updatedAt: string }>>([]);
  const [loadingSession, setLoadingSession] = useState(true);

  const loadSessionsList = useCallback(async () => {
    const res = await fetch("/api/agent/sessions");
    const data = (await res.json()) as {
      sessions?: Array<{ id: string; title: string | null; updatedAt: string }>;
    };
    setSessions(data.sessions ?? []);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoadingSession(true);
    try {
      const latest = await fetch("/api/agent/sessions?latest=1");
      const data = (await latest.json()) as { session: ChatSession | null };
      if (data.session) {
        setSession(data.session);
      } else {
        const created = await fetch("/api/agent/sessions", { method: "POST" });
        const createdJson = (await created.json()) as { session: ChatSession };
        setSession(createdJson.session);
      }
      await loadSessionsList();
    } finally {
      setLoadingSession(false);
    }
  }, [loadSessionsList]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (loadingSession || !session) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center text-zinc-400">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-zinc-950" key={session.id}>
      <AgentChatPanel
        session={session}
        onSessionChange={setSession}
        sessions={sessions}
        onReloadSessions={loadSessionsList}
      />
    </div>
  );
}
