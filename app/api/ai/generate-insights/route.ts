import { NextRequest, NextResponse } from "next/server";
import { groqClient, GROQ_MODEL } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prompt = String(body?.prompt || "").trim();
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    if (!groqClient) {
      return NextResponse.json({
        insights: [
          "Retention trend: active customer ratio is stable, but win-back opportunities are concentrated in at-risk high CLV users.",
          "Channel mix: SMS likely outperforms email on message efficiency in reactivation scenarios.",
          "Action: Launch a segmented win-back flow for 'Can't Lose Them' and 'At Risk' cohorts within 7 days.",
        ],
        mocked: true,
      });
    }

    const response = await groqClient.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: 900,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.choices[0]?.message?.content ?? "";

    return NextResponse.json({ raw: text, mocked: false });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to generate insights" }, { status: 500 });
  }
}
