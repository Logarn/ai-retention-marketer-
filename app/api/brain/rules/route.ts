import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RuleItem = {
  id: string;
  rule: string;
  explanation?: string | null;
  source?: string | null;
  priority: number;
};

type RulesPayload = {
  messagingDos?: RuleItem[];
  languageDos?: RuleItem[];
  complianceDos?: RuleItem[];
  designDos?: RuleItem[];
  timingDos?: RuleItem[];
  messagingDonts?: RuleItem[];
  languageDonts?: RuleItem[];
  complianceDonts?: RuleItem[];
  designDonts?: RuleItem[];
  toneDonts?: RuleItem[];
  cautionRules?: RuleItem[];
};

const RULE_KEYS = [
  "messagingDos",
  "languageDos",
  "complianceDos",
  "designDos",
  "timingDos",
  "messagingDonts",
  "languageDonts",
  "complianceDonts",
  "designDonts",
  "toneDonts",
  "cautionRules",
] as const;

type RuleKey = (typeof RULE_KEYS)[number];

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRuleList(input: unknown): RuleItem[] {
  if (!Array.isArray(input)) return [];

  const normalized = input
    .map((item, idx) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Partial<RuleItem>;
      const rule = String(raw.rule ?? "").trim();
      if (!rule) return null;
      const priorityRaw = Number(raw.priority);
      const priority = Number.isFinite(priorityRaw)
        ? Math.min(3, Math.max(1, Math.round(priorityRaw)))
        : 2;
      return {
        id: raw.id && raw.id.trim() ? raw.id : createId(),
        rule,
        explanation: raw.explanation?.trim() || null,
        source: raw.source?.trim() || "manual",
        priority,
        _idx: idx,
      };
    })
    .filter(Boolean) as Array<RuleItem & { _idx: number }>;

  normalized.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a._idx - b._idx;
  });

  return normalized.map(({ _idx: _drop, ...item }) => item);
}

function normalizeRulesPayload(input: Partial<RulesPayload>) {
  const data = {} as Record<RuleKey, RuleItem[]>;
  for (const key of RULE_KEYS) {
    data[key] = normalizeRuleList(input[key]);
  }
  return data;
}

async function ensureBrandProfileId() {
  const existing = await prisma.brandProfile.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.brandProfile.create({
    data: {
      brandName: "Your Brand",
      industryVertical: "skincare",
      pricePositioning: "premium",
      coreValues: ["quality", "customer-first"],
    },
    select: { id: true },
  });
  return created.id;
}

async function ensureRulesRecord() {
  const brandProfileId = await ensureBrandProfileId();
  const existing = await prisma.dosAndDonts.findUnique({
    where: { brandProfileId },
  });
  if (existing) return existing;

  return prisma.dosAndDonts.create({
    data: {
      brandProfileId,
      messagingDos: [],
      languageDos: [],
      complianceDos: [],
      designDos: [],
      timingDos: [],
      messagingDonts: [],
      languageDonts: [],
      complianceDonts: [],
      designDonts: [],
      toneDonts: [],
      cautionRules: [],
    },
  });
}

function mapRulesResponse(record: Awaited<ReturnType<typeof ensureRulesRecord>>) {
  return {
    id: record.id,
    brandProfileId: record.brandProfileId,
    messagingDos: normalizeRuleList(record.messagingDos),
    languageDos: normalizeRuleList(record.languageDos),
    complianceDos: normalizeRuleList(record.complianceDos),
    designDos: normalizeRuleList(record.designDos),
    timingDos: normalizeRuleList(record.timingDos),
    messagingDonts: normalizeRuleList(record.messagingDonts),
    languageDonts: normalizeRuleList(record.languageDonts),
    complianceDonts: normalizeRuleList(record.complianceDonts),
    designDonts: normalizeRuleList(record.designDonts),
    toneDonts: normalizeRuleList(record.toneDonts),
    cautionRules: normalizeRuleList(record.cautionRules),
    updatedAt: record.updatedAt,
  };
}

export async function GET() {
  try {
    const record = await ensureRulesRecord();
    return NextResponse.json({ rules: mapRulesResponse(record) });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load Do's and Don'ts",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<RulesPayload>;
    const normalized = normalizeRulesPayload(body);
    const record = await ensureRulesRecord();

    const updated = await prisma.dosAndDonts.update({
      where: { id: record.id },
      data: {
        messagingDos: normalized.messagingDos,
        languageDos: normalized.languageDos,
        complianceDos: normalized.complianceDos,
        designDos: normalized.designDos,
        timingDos: normalized.timingDos,
        messagingDonts: normalized.messagingDonts,
        languageDonts: normalized.languageDonts,
        complianceDonts: normalized.complianceDonts,
        designDonts: normalized.designDonts,
        toneDonts: normalized.toneDonts,
        cautionRules: normalized.cautionRules,
      },
    });

    return NextResponse.json({ rules: mapRulesResponse(updated) });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to update Do's and Don'ts",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
