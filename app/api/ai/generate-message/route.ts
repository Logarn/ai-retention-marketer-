import { NextResponse } from "next/server";
import { z } from "zod";
import { groqClient, GROQ_MODEL } from "@/lib/ai";

const payloadSchema = z.object({
  channel: z.enum(["email", "sms"]),
  campaignType: z.string().min(1),
  tone: z.string().min(1),
  customerContext: z.object({
    name: z.string().optional().nullable(),
    segment: z.string().optional().nullable(),
    lastPurchaseDate: z.string().optional().nullable(),
    lastProduct: z.string().optional().nullable(),
    orderCount: z.number().optional().nullable(),
    clv: z.number().optional().nullable(),
    recentViews: z.array(z.string()).optional().nullable(),
  }),
  brandVoice: z.string().min(1),
});

function buildFallbackVariants(input: z.infer<typeof payloadSchema>) {
  const name = input.customerContext.name ?? "there";
  if (input.channel === "email") {
    return [
      {
        subject: `A quick update for you, ${name}`,
        preview: "A personalized pick we think you'll love.",
        body: `Hi ${name},\n\nWe've put together a ${input.campaignType.replaceAll("_", " ")} message with a ${input.tone.toLowerCase()} tone for your segment (${input.customerContext.segment ?? "customer"}).\n\nCTA: Shop now and unlock your offer.`,
      },
      {
        subject: `Your next favorite is waiting`,
        preview: "Tailored for your recent shopping behavior.",
        body: `Hey ${name},\n\nBased on your recent activity, we selected products you'll likely love next. This message is aligned with your brand voice (${input.brandVoice.slice(0, 80)}...).\n\nCTA: Explore recommendations now.`,
      },
      {
        subject: `A special offer just for you`,
        preview: "Limited-time incentive for your next order.",
        body: `Hi ${name},\n\nYou're one of our valued customers and we'd love to welcome you back with a personalized offer.\n\nCTA: Redeem your offer today.`,
      },
    ];
  }
  return [
    { message: `Hi ${name}, your personalized offer is live. Tap to shop now: {{link}}` },
    { message: `${name}, we picked something you'll love. See your recommendations: {{link}}` },
    { message: `Limited-time ${input.campaignType.replaceAll("_", " ")} deal for you, ${name}: {{link}}` },
  ];
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const prompt = `You are an expert e-commerce retention marketer. Generate a ${input.channel} message for a ${input.campaignType} campaign.

Customer context:
- Name: ${input.customerContext.name ?? "Unknown"}
- Segment: ${input.customerContext.segment ?? "Unknown"}
- Last purchase: ${input.customerContext.lastPurchaseDate ?? "Unknown"} — ${input.customerContext.lastProduct ?? "Unknown"}
- Total orders: ${input.customerContext.orderCount ?? 0}
- Lifetime value: ${input.customerContext.clv ?? 0}
- Browsing history: ${(input.customerContext.recentViews ?? []).join(", ") || "None"}

Brand voice: ${input.brandVoice}

Tone: ${input.tone}

Requirements:
- For EMAIL: Generate subject line (max 50 chars), preview text (max 90 chars), and body (max 200 words)
- For SMS: Generate message (max 160 chars including CTA link placeholder)
- Include personalization using customer context
- Include clear CTA
- Generate exactly 3 variants for A/B testing
- Return STRICT JSON only with this shape:
{
  "variants": [
    { "subject": "...", "preview": "...", "body": "..." },
    { "subject": "...", "preview": "...", "body": "..." },
    { "subject": "...", "preview": "...", "body": "..." }
  ]
}
For SMS variant objects should be: { "message": "..." }`;

    if (!groqClient) {
      return NextResponse.json(
        {
          variants: buildFallbackVariants(input),
          source: "mock",
          note: "GROQ_API_KEY not set, returned mocked variants.",
        },
        { status: 200 },
      );
    }

    const completion = await groqClient.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.8,
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "";

    const parsedJson = JSON.parse(text);
    return NextResponse.json({ ...parsedJson, source: "groq" });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to generate message variants",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
