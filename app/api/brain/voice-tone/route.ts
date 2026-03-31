import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type ToneContextKey =
  | "welcome"
  | "promotional"
  | "educational"
  | "vip"
  | "winback"
  | "transactional"
  | "apology"
  | "launch";

type TonePreset = {
  description: string;
  subjectLine: string;
  openingLine: string;
  cta: string;
};

type VoiceTonePayload = {
  formalCasual: number;
  seriousPlayful: number;
  reservedEnthusiastic: number;
  technicalSimple: number;
  traditionalEdgy: number;
  corporatePersonal: number;
  sentenceLength?: string | null;
  paragraphLength?: string | null;
  useContractions?: string | null;
  useExclamations?: string | null;
  useCaps?: string | null;
  greetingStyle?: string | null;
  signoffStyle?: string | null;
  customerReference?: string | null;
  brandReference?: string | null;
  preferredAdjectives?: string[];
  preferredVerbs?: string[];
  preferredCTAs?: string[];
  signaturePhrases?: string[];
  contexts: Record<ToneContextKey, TonePreset>;
};

const DEFAULT_CONTEXTS: Record<ToneContextKey, TonePreset> = {
  welcome: {
    description: "Warm, clear, and instantly reassuring for first-time subscribers.",
    subjectLine: "Welcome to the inside circle",
    openingLine: "You found us at the perfect moment.",
    cta: "Explore your first picks",
  },
  promotional: {
    description: "High clarity and urgency without pressure or hype fatigue.",
    subjectLine: "Your favorites just got better",
    openingLine: "Here is the offer worth opening right now.",
    cta: "Shop the offer",
  },
  educational: {
    description: "Guiding and helpful with practical takeaways.",
    subjectLine: "A smarter way to get results",
    openingLine: "Let us break this down in 30 seconds.",
    cta: "Learn how it works",
  },
  vip: {
    description: "Exclusive and appreciative, with elevated access language.",
    subjectLine: "Reserved for our VIP members",
    openingLine: "You are getting this before everyone else.",
    cta: "Unlock early access",
  },
  winback: {
    description: "Empathetic and low-pressure, focused on relevance.",
    subjectLine: "Still thinking about it?",
    openingLine: "If now is the right time, we made this easy for you.",
    cta: "Come back and save",
  },
  transactional: {
    description: "Clear logistics with a warm, professional touch.",
    subjectLine: "Order confirmed",
    openingLine: "Your order is in and we are on it.",
    cta: "Track your order",
  },
  apology: {
    description: "Owning mistakes directly, then resolving quickly.",
    subjectLine: "We missed the mark and we are fixing it",
    openingLine: "You deserved better, and we want to make this right.",
    cta: "See your resolution",
  },
  launch: {
    description: "Exciting and momentum-driven, centered on what is new.",
    subjectLine: "It just dropped",
    openingLine: "Our newest release is finally live.",
    cta: "See the launch",
  },
};

const DEFAULT_VOICE: VoiceTonePayload = {
  formalCasual: 6,
  seriousPlayful: 5,
  reservedEnthusiastic: 6,
  technicalSimple: 7,
  traditionalEdgy: 5,
  corporatePersonal: 7,
  sentenceLength: "medium",
  paragraphLength: "1-2",
  useContractions: "always",
  useExclamations: "sparingly",
  useCaps: "never",
  greetingStyle: "Hey",
  signoffStyle: "With love",
  customerReference: "friend",
  brandReference: "we",
  preferredAdjectives: ["clean", "effective", "premium"],
  preferredVerbs: ["discover", "unlock", "experience"],
  preferredCTAs: ["Shop now", "Get yours", "Explore"],
  signaturePhrases: ["Made for your routine", "Feel the difference"],
  contexts: DEFAULT_CONTEXTS,
};

function clampSlider(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(10, Math.round(parsed)));
}

function toStringArray(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function normalizePreset(input: unknown, fallback: TonePreset): TonePreset {
  if (!input || typeof input !== "object") return fallback;
  const payload = input as Partial<TonePreset>;
  return {
    description: (payload.description ?? fallback.description).trim(),
    subjectLine: (payload.subjectLine ?? fallback.subjectLine).trim(),
    openingLine: (payload.openingLine ?? fallback.openingLine).trim(),
    cta: (payload.cta ?? fallback.cta).trim(),
  };
}

function normalizePayload(input: Partial<VoiceTonePayload>) {
  const contexts = Object.keys(DEFAULT_CONTEXTS).reduce((acc, key) => {
    const typed = key as ToneContextKey;
    acc[typed] = normalizePreset(input.contexts?.[typed], DEFAULT_CONTEXTS[typed]);
    return acc;
  }, {} as Record<ToneContextKey, TonePreset>);

  return {
    formalCasual: clampSlider(input.formalCasual, DEFAULT_VOICE.formalCasual),
    seriousPlayful: clampSlider(input.seriousPlayful, DEFAULT_VOICE.seriousPlayful),
    reservedEnthusiastic: clampSlider(
      input.reservedEnthusiastic,
      DEFAULT_VOICE.reservedEnthusiastic,
    ),
    technicalSimple: clampSlider(input.technicalSimple, DEFAULT_VOICE.technicalSimple),
    traditionalEdgy: clampSlider(input.traditionalEdgy, DEFAULT_VOICE.traditionalEdgy),
    corporatePersonal: clampSlider(input.corporatePersonal, DEFAULT_VOICE.corporatePersonal),
    sentenceLength: input.sentenceLength ?? DEFAULT_VOICE.sentenceLength,
    paragraphLength: input.paragraphLength ?? DEFAULT_VOICE.paragraphLength,
    useContractions: input.useContractions ?? DEFAULT_VOICE.useContractions,
    useExclamations: input.useExclamations ?? DEFAULT_VOICE.useExclamations,
    useCaps: input.useCaps ?? DEFAULT_VOICE.useCaps,
    greetingStyle: input.greetingStyle ?? DEFAULT_VOICE.greetingStyle,
    signoffStyle: input.signoffStyle ?? DEFAULT_VOICE.signoffStyle,
    customerReference: input.customerReference ?? DEFAULT_VOICE.customerReference,
    brandReference: input.brandReference ?? DEFAULT_VOICE.brandReference,
    preferredAdjectives: toStringArray(input.preferredAdjectives, DEFAULT_VOICE.preferredAdjectives),
    preferredVerbs: toStringArray(input.preferredVerbs, DEFAULT_VOICE.preferredVerbs),
    preferredCTAs: toStringArray(input.preferredCTAs, DEFAULT_VOICE.preferredCTAs),
    signaturePhrases: toStringArray(input.signaturePhrases, DEFAULT_VOICE.signaturePhrases),
    contexts,
  };
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

async function ensureVoiceTone() {
  const brandProfileId = await ensureBrandProfileId();
  const existing = await prisma.voiceTone.findUnique({
    where: { brandProfileId },
  });
  if (existing) return existing;

  return prisma.voiceTone.create({
    data: {
      brandProfileId,
      formalCasual: DEFAULT_VOICE.formalCasual,
      seriousPlayful: DEFAULT_VOICE.seriousPlayful,
      reservedEnthusiastic: DEFAULT_VOICE.reservedEnthusiastic,
      technicalSimple: DEFAULT_VOICE.technicalSimple,
      traditionalEdgy: DEFAULT_VOICE.traditionalEdgy,
      corporatePersonal: DEFAULT_VOICE.corporatePersonal,
      welcomeTone: DEFAULT_VOICE.contexts.welcome,
      promotionalTone: DEFAULT_VOICE.contexts.promotional,
      educationalTone: DEFAULT_VOICE.contexts.educational,
      vipTone: DEFAULT_VOICE.contexts.vip,
      winbackTone: DEFAULT_VOICE.contexts.winback,
      transactionalTone: DEFAULT_VOICE.contexts.transactional,
      apologyTone: DEFAULT_VOICE.contexts.apology,
      launchTone: DEFAULT_VOICE.contexts.launch,
      sentenceLength: DEFAULT_VOICE.sentenceLength,
      paragraphLength: DEFAULT_VOICE.paragraphLength,
      useContractions: DEFAULT_VOICE.useContractions,
      useExclamations: DEFAULT_VOICE.useExclamations,
      useCaps: DEFAULT_VOICE.useCaps,
      greetingStyle: DEFAULT_VOICE.greetingStyle,
      signoffStyle: DEFAULT_VOICE.signoffStyle,
      customerReference: DEFAULT_VOICE.customerReference,
      brandReference: DEFAULT_VOICE.brandReference,
      preferredAdjectives: DEFAULT_VOICE.preferredAdjectives,
      preferredVerbs: DEFAULT_VOICE.preferredVerbs,
      preferredCTAs: DEFAULT_VOICE.preferredCTAs,
      signaturePhrases: DEFAULT_VOICE.signaturePhrases,
    },
  });
}

function asPreset(value: unknown, fallback: TonePreset) {
  return normalizePreset(value, fallback);
}

function mapVoiceToneResponse(voiceTone: Awaited<ReturnType<typeof ensureVoiceTone>>) {
  return {
    id: voiceTone.id,
    brandProfileId: voiceTone.brandProfileId,
    formalCasual: voiceTone.formalCasual,
    seriousPlayful: voiceTone.seriousPlayful,
    reservedEnthusiastic: voiceTone.reservedEnthusiastic,
    technicalSimple: voiceTone.technicalSimple,
    traditionalEdgy: voiceTone.traditionalEdgy,
    corporatePersonal: voiceTone.corporatePersonal,
    sentenceLength: voiceTone.sentenceLength,
    paragraphLength: voiceTone.paragraphLength,
    useContractions: voiceTone.useContractions,
    useExclamations: voiceTone.useExclamations,
    useCaps: voiceTone.useCaps,
    greetingStyle: voiceTone.greetingStyle,
    signoffStyle: voiceTone.signoffStyle,
    customerReference: voiceTone.customerReference,
    brandReference: voiceTone.brandReference,
    preferredAdjectives: voiceTone.preferredAdjectives,
    preferredVerbs: voiceTone.preferredVerbs,
    preferredCTAs: voiceTone.preferredCTAs,
    signaturePhrases: voiceTone.signaturePhrases,
    contexts: {
      welcome: asPreset(voiceTone.welcomeTone, DEFAULT_CONTEXTS.welcome),
      promotional: asPreset(voiceTone.promotionalTone, DEFAULT_CONTEXTS.promotional),
      educational: asPreset(voiceTone.educationalTone, DEFAULT_CONTEXTS.educational),
      vip: asPreset(voiceTone.vipTone, DEFAULT_CONTEXTS.vip),
      winback: asPreset(voiceTone.winbackTone, DEFAULT_CONTEXTS.winback),
      transactional: asPreset(voiceTone.transactionalTone, DEFAULT_CONTEXTS.transactional),
      apology: asPreset(voiceTone.apologyTone, DEFAULT_CONTEXTS.apology),
      launch: asPreset(voiceTone.launchTone, DEFAULT_CONTEXTS.launch),
    } as Record<ToneContextKey, TonePreset>,
    updatedAt: voiceTone.updatedAt,
  };
}

export async function GET() {
  try {
    const voiceTone = await ensureVoiceTone();
    return NextResponse.json({ voiceTone: mapVoiceToneResponse(voiceTone) });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load voice and tone settings",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<VoiceTonePayload>;
    const normalized = normalizePayload(body);
    const brandProfileId = await ensureBrandProfileId();
    const voiceTone = await ensureVoiceTone();

    const updated = await prisma.voiceTone.update({
      where: { id: voiceTone.id },
      data: {
        brandProfileId,
        formalCasual: normalized.formalCasual,
        seriousPlayful: normalized.seriousPlayful,
        reservedEnthusiastic: normalized.reservedEnthusiastic,
        technicalSimple: normalized.technicalSimple,
        traditionalEdgy: normalized.traditionalEdgy,
        corporatePersonal: normalized.corporatePersonal,
        sentenceLength: normalized.sentenceLength,
        paragraphLength: normalized.paragraphLength,
        useContractions: normalized.useContractions,
        useExclamations: normalized.useExclamations,
        useCaps: normalized.useCaps,
        greetingStyle: normalized.greetingStyle,
        signoffStyle: normalized.signoffStyle,
        customerReference: normalized.customerReference,
        brandReference: normalized.brandReference,
        preferredAdjectives: normalized.preferredAdjectives,
        preferredVerbs: normalized.preferredVerbs,
        preferredCTAs: normalized.preferredCTAs,
        signaturePhrases: normalized.signaturePhrases,
        welcomeTone: normalized.contexts.welcome,
        promotionalTone: normalized.contexts.promotional,
        educationalTone: normalized.contexts.educational,
        vipTone: normalized.contexts.vip,
        winbackTone: normalized.contexts.winback,
        transactionalTone: normalized.contexts.transactional,
        apologyTone: normalized.contexts.apology,
        launchTone: normalized.contexts.launch,
      },
    });

    return NextResponse.json({ voiceTone: mapVoiceToneResponse(updated) });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to update voice and tone settings",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
