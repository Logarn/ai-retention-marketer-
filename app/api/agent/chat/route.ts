import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { groqClient, GROQ_MODEL } from "@/lib/ai";
import { DEFAULT_STORE_ID } from "@/app/api/brain/profile/store";
import { WORKLIN_PERSONALITY } from "@/lib/agent/worklin";
import { loadBrandContextForAgent } from "@/lib/agent/brand-context";
import { extractJsonText } from "@/lib/brain/analyze-store-normalize";

export const maxDuration = 10;

const bodySchema = z.object({
  sessionId: z.string().min(1),
  message: z.string(),
  payload: z
    .object({
      kind: z.enum(["store_analysis", "documents_done", "skip_docs"]),
      analysisData: z.record(z.string(), z.any()).optional(),
    })
    .optional(),
});

function normalizeUrlInput(raw: string) {
  const t = raw.trim();
  if (!t) return null;
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    new URL(withProto);
    return withProto;
  } catch {
    return null;
  }
}

async function groqJson(system: string, user: string) {
  if (!groqClient) throw new Error("GROQ_API_KEY is not configured.");
  const res = await groqClient.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.3,
    max_completion_tokens: 900,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

async function parseRulesFromText(text: string) {
  const raw = await groqJson(
    `Return ONLY JSON: { "dos": string[], "donts": string[] } with up to 8 each. Empty arrays if none.`,
    `Extract brand messaging rules from:\n${text.slice(0, 3000)}`,
  );
  const json = extractJsonText(raw);
  if (!json) return { dos: [] as string[], donts: [] as string[] };
  try {
    const p = JSON.parse(json) as { dos?: string[]; donts?: string[] };
    return {
      dos: Array.isArray(p.dos) ? p.dos.map(String).filter(Boolean).slice(0, 8) : [],
      donts: Array.isArray(p.donts) ? p.donts.map(String).filter(Boolean).slice(0, 8) : [],
    };
  } catch {
    return { dos: [], donts: [] };
  }
}

async function suggestCompetitors() {
  const ctx = await loadBrandContextForAgent();
  const raw = await groqJson(
    `Return ONLY JSON: { "competitors": [ { "name": string, "why": string, "guessUrl"?: string } ] } exactly 3 items.`,
    `Suggest 3 competitor brands in the same niche as this business:\n${ctx.slice(0, 3500)}`,
  );
  const json = extractJsonText(raw);
  if (!json) return [];
  try {
    const p = JSON.parse(json) as { competitors?: Array<{ name?: string; why?: string; guessUrl?: string }> };
    return (p.competitors ?? []).slice(0, 3);
  } catch {
    return [];
  }
}

function voicePresetFromChip(chip: string): Record<string, number> {
  const c = chip.toLowerCase();
  if (c.includes("professional")) {
    return { voiceFormalCasual: 28, voiceAuthoritativeApproachable: 78, voiceSeriousPlayful: 42 };
  }
  if (c.includes("friendly")) {
    return { voiceFormalCasual: 48, voiceReservedEnthusiastic: 68, voiceAuthoritativeApproachable: 55 };
  }
  if (c.includes("bold")) {
    return { voiceEdgySafe: 88, voiceSeriousPlayful: 72, voiceLuxuryAccessible: 45 };
  }
  if (c.includes("chill") || c.includes("conversational")) {
    return { voiceFormalCasual: 62, voiceSeriousPlayful: 58, voiceTechnicalSimple: 65 };
  }
  return { voiceFormalCasual: 50, voiceSeriousPlayful: 50 };
}

async function applyAnalyzeStore(requestUrl: string, analysisData: Record<string, unknown>) {
  const applyUrl = new URL("/api/brain/analyze-store/apply", requestUrl);
  const res = await fetch(applyUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      analysisData,
      sections: ["identity", "audience", "voice", "rules", "ctas", "phrases", "emailPrefs"],
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    console.warn("[agent/chat] analyze-store apply failed", err);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { sessionId, message, payload } = parsed.data;
    const requestUrl = request.url;

    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, storeId: DEFAULT_STORE_ID },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    /** Client finished store analyzer — apply + show summary + confirmation chips */
    if (payload?.kind === "store_analysis") {
      if (session.status !== "onboarding" || session.currentStep !== 2) {
        return NextResponse.json({ error: "Invalid step for store analysis" }, { status: 409 });
      }
      const analysis = payload.analysisData;
      if (!analysis || typeof analysis !== "object") {
        return NextResponse.json({ error: "analysisData required" }, { status: 400 });
      }

      await applyAnalyzeStore(requestUrl, analysis as Record<string, unknown>);

      const brandName = String((analysis as { brandName?: string }).brandName ?? "your brand");
      const industry = String((analysis as { industry?: string }).industry ?? "—");
      const niche = String((analysis as { niche?: string }).niche ?? "—");
      const usp = String((analysis as { usp?: string }).usp ?? "—");
      const voiceDescription = String((analysis as { voiceDescription?: string }).voiceDescription ?? "—");

      const summaryContent = `Alright, I just stalked your website (professionally, of course) and here's what I picked up about **${brandName}**:

🏷️ **Industry:** ${industry}
🎯 **Niche:** ${niche}
💡 **What makes you special:** ${usp}
🗣️ **Your vibe:** ${voiceDescription}

I've saved all of this to your Brain (that's where I keep everything I learn about you).`;

      await prisma.chatMessage.createMany({
        data: [
          {
            sessionId,
            role: "agent",
            content: summaryContent,
            messageType: "analysis_result",
            metadata: JSON.stringify({ analysis }),
          },
          {
            sessionId,
            role: "agent",
            content: "How'd I do?",
            messageType: "chips",
            metadata: JSON.stringify({
              chips: ["Spot on! 🎯", "Close but needs tweaking", "Way off — let me explain"],
            }),
          },
        ],
      });

      const updated = await prisma.chatSession.update({
        where: { id: sessionId },
        data: { currentStep: 3 },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      return NextResponse.json({ session: updated });
    }

    if (payload?.kind === "documents_done" || payload?.kind === "skip_docs") {
      if (session.status !== "onboarding" || session.currentStep !== 6) {
        return NextResponse.json({ error: "Invalid step for documents" }, { status: 409 });
      }
      await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "agent",
          content:
            payload.kind === "skip_docs"
              ? "No worries — you can upload docs anytime under Brand Documents."
              : "Nice — those docs are in the vault. I'll mine them when I write for you.",
          messageType: "text",
        },
      });
      await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "agent",
          content:
            "Last thing — let's check out the competition. What's your niche? I'll find brands that are absolutely killing it in your space.",
          messageType: "chips",
          metadata: JSON.stringify({
            chips: ["Find my competitors", "I'll tell you who they are", "Skip for now"],
          }),
        },
      });
      const updated = await prisma.chatSession.update({
        where: { id: sessionId },
        data: { currentStep: 7 },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      return NextResponse.json({ session: updated });
    }

    const userText = message.trim();

    /** Free chat */
    if (session.status === "active") {
      if (!userText) {
        return NextResponse.json({ error: "Message required" }, { status: 400 });
      }

      await prisma.chatMessage.create({
        data: { sessionId, role: "user", content: userText, messageType: "text" },
      });

      const history = await prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      const brandCtx = await loadBrandContextForAgent();
      const historyAsc = [...history].reverse();
      const convo = historyAsc
        .map((m) => `${m.role === "agent" ? "Worklin" : "User"}: ${m.content.slice(0, 2000)}`)
        .join("\n");

      if (!groqClient) {
        await prisma.chatMessage.create({
          data: {
            sessionId,
            role: "agent",
            content: "I'd love to help, but GROQ_API_KEY isn't configured on the server.",
            messageType: "text",
          },
        });
      } else {
        const res = await groqClient.chat.completions.create({
          model: GROQ_MODEL,
          temperature: 0.55,
          max_completion_tokens: 700,
          messages: [
            {
              role: "system",
              content: `${WORKLIN_PERSONALITY}\n\nBrand context:\n${brandCtx}\n\nHelp with retention marketing, email, campaigns, and brand voice. Stay concise.`,
            },
            { role: "user", content: `Conversation so far:\n${convo}\n\nUser message: ${userText}` },
          ],
        });
        const reply = res.choices[0]?.message?.content?.trim() ?? "Hmm, I drew a blank. Try again?";
        await prisma.chatMessage.create({
          data: { sessionId, role: "agent", content: reply, messageType: "text" },
        });
      }

      const updated = await prisma.chatSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      return NextResponse.json({ session: updated });
    }

    /** Onboarding — record user message */
    if (userText) {
      await prisma.chatMessage.create({
        data: { sessionId, role: "user", content: userText, messageType: "text" },
      });
    }

    const step = session.currentStep;

    if (step === 0 && userText) {
      await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "agent",
          content:
            "First things first — drop your website URL and I'll go full detective mode on your brand. I'll read your site, study your products, and figure out your whole vibe.\n\nJust paste the URL below 👇",
          messageType: "text",
        },
      });
      const updated = await prisma.chatSession.update({
        where: { id: sessionId },
        data: { currentStep: 1 },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      return NextResponse.json({ session: updated });
    }

    if (step === 1 && userText) {
      const url = normalizeUrlInput(userText);
      if (!url) {
        await prisma.chatMessage.create({
          data: {
            sessionId,
            role: "agent",
            content:
              "That doesn't look like a URL — try something like `https://yourbrand.com` or `yourstore.myshopify.com`.",
            messageType: "text",
          },
        });
        const updated = await prisma.chatSession.findUniqueOrThrow({
          where: { id: sessionId },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        });
        return NextResponse.json({ session: updated });
      }
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { currentStep: 2 },
      });
      return NextResponse.json({
        session: await prisma.chatSession.findUniqueOrThrow({
          where: { id: sessionId },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        }),
        clientAction: { type: "run_store_analyzer", url },
      });
    }

    if (step === 3 && userText) {
      await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "agent",
          content:
            "Now let's dial in your voice a bit more. When you send emails to customers, what's the energy?",
          messageType: "chips",
          metadata: JSON.stringify({
            chips: ["Professional & polished", "Friendly & warm", "Bold & edgy", "Chill & conversational"],
          }),
        },
      });
      const updated = await prisma.chatSession.update({
        where: { id: sessionId },
        data: { currentStep: 4 },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      return NextResponse.json({ session: updated });
    }

    if (step === 4 && userText) {
      const patch = voicePresetFromChip(userText);
      await prisma.brandProfile.update({
        where: { storeId: DEFAULT_STORE_ID },
        data: patch,
      });
      await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "agent",
          content:
            "Got it! Now the important stuff — any absolute rules? Things I should ALWAYS do or NEVER do when writing for your brand?\n\nJust type them out, or skip if you want to set these up later.",
          messageType: "chips",
          metadata: JSON.stringify({ chips: ["Let me type some rules", "Skip for now"] }),
        },
      });
      const updated = await prisma.chatSession.update({
        where: { id: sessionId },
        data: { currentStep: 5 },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      return NextResponse.json({ session: updated });
    }

    if (step === 5 && userText) {
      const lower = userText.toLowerCase();
      if (lower.includes("let me type") || lower.includes("type some rules")) {
        await prisma.chatMessage.create({
          data: {
            sessionId,
            role: "agent",
            content: "Go for it — drop your do's and don'ts in your next message (bullet points work).",
            messageType: "text",
          },
        });
        const updated = await prisma.chatSession.findUniqueOrThrow({
          where: { id: sessionId },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        });
        return NextResponse.json({ session: updated });
      }
      if (!lower.includes("skip")) {
        const { dos, donts } = await parseRulesFromText(userText);
        const existing = await prisma.brandRule.findMany({ where: { storeId: DEFAULT_STORE_ID } });
        const set = new Set(existing.map((r) => `${r.type}::${r.rule.toLowerCase()}`));
        const rows: Array<{ storeId: string; rule: string; type: string; priority: string }> = [];
        for (const r of dos) {
          const k = `do::${r.toLowerCase()}`;
          if (set.has(k)) continue;
          rows.push({ storeId: DEFAULT_STORE_ID, type: "do", rule: r, priority: "important" });
          set.add(k);
        }
        for (const r of donts) {
          const k = `dont::${r.toLowerCase()}`;
          if (set.has(k)) continue;
          rows.push({ storeId: DEFAULT_STORE_ID, type: "dont", rule: r, priority: "important" });
          set.add(k);
        }
        if (rows.length) await prisma.brandRule.createMany({ data: rows });
      }

      await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "agent",
          content:
            "Got any brand docs? Style guides, brand books, past campaigns — anything that helps me understand your brand DNA.\n\nDrop files here or skip if you don't have any handy.",
          messageType: "chips",
          metadata: JSON.stringify({ chips: ["I'll upload some docs", "Skip for now"] }),
        },
      });
      const updated = await prisma.chatSession.update({
        where: { id: sessionId },
        data: { currentStep: 6 },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      return NextResponse.json({ session: updated });
    }

    if (step === 6 && userText) {
      const lower = userText.toLowerCase();
      if (lower.includes("skip")) {
        await prisma.chatMessage.create({
          data: {
            sessionId,
            role: "agent",
            content: "No worries — you can upload docs anytime under Brand Documents.",
            messageType: "text",
          },
        });
        await prisma.chatMessage.create({
          data: {
            sessionId,
            role: "agent",
            content:
              "Last thing — let's check out the competition. Want me to suggest a few brands crushing it in your space?",
            messageType: "chips",
            metadata: JSON.stringify({
              chips: ["Find my competitors", "I'll tell you who they are", "Skip for now"],
            }),
          },
        });
        const updated = await prisma.chatSession.update({
          where: { id: sessionId },
          data: { currentStep: 7 },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        });
        return NextResponse.json({ session: updated });
      }
      await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "agent",
          content: "Hit the paperclip to upload PDF, DOCX, or TXT — I'll parse them into your Brain.",
          messageType: "text",
        },
      });
      const updated = await prisma.chatSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      return NextResponse.json({ session: updated, clientAction: { type: "prompt_file_upload" } });
    }

    if (step === 7 && userText) {
      const lower = userText.toLowerCase();
      if (lower.includes("find my")) {
        const comps = await suggestCompetitors();
        const lines = comps
          .map((c, i) => `${i + 1}. **${c.name ?? "Competitor"}** — ${c.why ?? ""}`)
          .join("\n");
        await prisma.chatMessage.create({
          data: {
            sessionId,
            role: "agent",
            content:
              lines ||
              "I couldn't nail competitors from context alone — drop a few names and I'll remember them.",
            messageType: "text",
          },
        });
      } else if (lower.includes("skip")) {
        await prisma.chatMessage.create({
          data: {
            sessionId,
            role: "agent",
            content: "Skipping competitors — we can add them later.",
            messageType: "text",
          },
        });
      } else {
        await prisma.chatMessage.create({
          data: {
            sessionId,
            role: "agent",
            content: `Locked in: ${userText.slice(0, 600)}`,
            messageType: "text",
          },
        });
      }

      const profile = await prisma.brandProfile.findUnique({ where: { storeId: DEFAULT_STORE_ID } });
      const summaryCard = `🎉 We're all set! Here's what I know about your brand so far:

**${profile?.brandName ?? "Your brand"}** · ${profile?.industry ?? "—"} · ${profile?.niche ?? "—"}

Voice: ${(profile?.voiceDescription ?? "").slice(0, 200) || "Still cooking."}

I'm ready to work. What do you want to tackle first?`;

      await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "agent",
          content: summaryCard,
          messageType: "chips",
          metadata: JSON.stringify({
            chips: ["Plan a campaign 📅", "Write me an email ✍️", "Run a voice test 🎤", "Just chat 💬"],
          }),
        },
      });

      const updated = await prisma.chatSession.update({
        where: { id: sessionId },
        data: { currentStep: 8, status: "active" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      return NextResponse.json({ session: updated });
    }

    if (step === 8 && userText) {
      await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "agent",
          content:
            "You're in. Hit **The Brain** for profile tweaks, **Store Analyzer** if the site changes, or keep vibing with me here.",
          messageType: "text",
        },
      });
      const updated = await prisma.chatSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      return NextResponse.json({ session: updated });
    }

    const updated = await prisma.chatSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    return NextResponse.json({ session: updated });
  } catch (error) {
    console.error("[agent/chat]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat failed" },
      { status: 500 },
    );
  }
}
