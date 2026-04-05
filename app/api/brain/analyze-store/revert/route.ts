import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const maxDuration = 10;

const bodySchema = z.object({
  ruleIds: z.array(z.string()).optional(),
  ctaIds: z.array(z.string()).optional(),
  phraseIds: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { ruleIds = [], ctaIds = [], phraseIds = [] } = parsed.data;

    const [rules, ctas, phrases] = await Promise.all([
      ruleIds.length
        ? prisma.brandRule.deleteMany({ where: { id: { in: ruleIds } } })
        : Promise.resolve({ count: 0 }),
      ctaIds.length
        ? prisma.brandCTA.deleteMany({ where: { id: { in: ctaIds } } })
        : Promise.resolve({ count: 0 }),
      phraseIds.length
        ? prisma.brandPhrase.deleteMany({ where: { id: { in: phraseIds } } })
        : Promise.resolve({ count: 0 }),
    ]);

    return NextResponse.json({
      success: true,
      deleted: {
        rules: "count" in rules ? rules.count : 0,
        ctas: "count" in ctas ? ctas.count : 0,
        phrases: "count" in phrases ? phrases.count : 0,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Revert failed" },
      { status: 500 },
    );
  }
}
