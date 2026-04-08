import {
  convertToModelMessages,
  stepCountIs,
  streamText,
} from "ai";
import { readFileSync } from "fs";
import { join } from "path";
import { createGroq } from "@ai-sdk/groq";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/app/api/brain/profile/store";
import { worklinTools } from "@/lib/agent/tools";
import { OPERATIONAL_INSTRUCTIONS } from "@/lib/agent/operational-instructions";
import { buildAgentSystemPrompt, extractEssentialSoulSections } from "@/lib/agent/soul-compact";
import type { UIMessage } from "ai";

const GROQ_MODEL_ID = "llama-3.3-70b-versatile" as const;

export const maxDuration = 60;

function loadSoulDocument(): string {
  try {
    return readFileSync(join(process.cwd(), "lib/agent/SOUL.md"), "utf-8").trim();
  } catch (e) {
    console.warn("[agent/chat] SOUL.md not loaded:", e instanceof Error ? e.message : e);
    return "";
  }
}

const SOUL_FULL = loadSoulDocument();
const SOUL_ESSENTIAL = SOUL_FULL ? extractEssentialSoulSections(SOUL_FULL) : "";

const SYSTEM = buildAgentSystemPrompt(SOUL_ESSENTIAL, OPERATIONAL_INSTRUCTIONS);

function getTextFromUserMessage(msg: UIMessage): string {
  if (msg.role !== "user") return "";
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

export async function POST(req: Request) {
  console.log("Agent chat POST received");
  try {
    const raw = (await req.json()) as Record<string, unknown>;
    console.log("[agent/chat] incoming keys:", Object.keys(raw), "messages len:", Array.isArray(raw.messages) ? raw.messages.length : "missing");

    const body = raw as {
      messages?: UIMessage[];
      sessionId?: string;
    };

    const sessionId = body.sessionId;
    const messages = body.messages ?? [];
    console.log("Request body (messages JSON length):", JSON.stringify(messages).length);
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Invalid prompt: messages must not be empty. Ensure the client sends the full UI messages array." },
        { status: 400 },
      );
    }

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, storeId: DEFAULT_STORE_ID },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userText = lastUser ? getTextFromUserMessage(lastUser) : "";
    if (lastUser && userText) {
      await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "user",
          content: userText,
        },
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not configured on the server." },
        { status: 500 },
      );
    }

    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    const model = groq(GROQ_MODEL_ID);
    console.log(
      "[agent/chat] SOUL full:",
      SOUL_FULL.length,
      "chars, essential:",
      SOUL_ESSENTIAL.length,
      "chars, system:",
      SYSTEM.length,
      "chars — Groq model:",
      GROQ_MODEL_ID,
    );

    try {
      const modelMessages = await convertToModelMessages(messages, {
        tools: worklinTools,
        ignoreIncompleteToolCalls: true,
      });
      console.log("[agent/chat] modelMessages count after convertToModelMessages:", modelMessages.length);
      if (modelMessages.length === 0) {
        return NextResponse.json(
          { error: "No model messages after conversion — check UI message parts and roles." },
          { status: 400 },
        );
      }

      const result = streamText({
        model,
        system: SYSTEM,
        messages: modelMessages,
        tools: worklinTools,
        stopWhen: stepCountIs(5),
        onFinish: async ({ text }) => {
          const trimmed = text?.trim();
          if (trimmed) {
            await prisma.chatMessage.create({
              data: {
                sessionId,
                role: "assistant",
                content: trimmed,
              },
            });
            const nextTitle =
              session.title && session.title !== "New Chat"
                ? session.title
                : userText
                  ? userText.slice(0, 80) + (userText.length > 80 ? "…" : "")
                  : "Worklin chat";
            await prisma.chatSession.update({
              where: { id: sessionId },
              data: { title: nextTitle },
            });
          }
        },
      });

      return result.toUIMessageStreamResponse();
    } catch (error) {
      console.error("Agent chat error:", error);
      const err = error instanceof Error ? error : new Error(String(error));
      return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("[agent/chat]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat failed" },
      { status: 500 },
    );
  }
}
