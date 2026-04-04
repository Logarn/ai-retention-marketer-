import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type BrandProfilePayload = {
  brandName: string;
  tagline?: string | null;
  industryVertical: string;
  pricePositioning: string;
  foundedYear?: number | null;
  brandStory?: string | null;
  missionStatement?: string | null;
  coreValues?: string[];
  shopifyStoreUrl?: string | null;
  websiteUrl?: string | null;
};

const DEFAULT_PROFILE: BrandProfilePayload = {
  brandName: "Your Brand",
  tagline: "",
  industryVertical: "skincare",
  pricePositioning: "premium",
  foundedYear: null,
  brandStory: "",
  missionStatement: "",
  coreValues: ["quality", "customer-first"],
  shopifyStoreUrl: "",
  websiteUrl: "",
};

function normalizePayload(input: Partial<BrandProfilePayload>) {
  return {
    brandName: (input.brandName ?? DEFAULT_PROFILE.brandName).trim(),
    tagline: input.tagline ?? null,
    industryVertical: (input.industryVertical ?? DEFAULT_PROFILE.industryVertical).trim(),
    pricePositioning: (input.pricePositioning ?? DEFAULT_PROFILE.pricePositioning).trim(),
    foundedYear: input.foundedYear ?? null,
    brandStory: input.brandStory ?? null,
    missionStatement: input.missionStatement ?? null,
    coreValues:
      input.coreValues?.map((item) => item.trim()).filter(Boolean) ?? DEFAULT_PROFILE.coreValues ?? [],
    shopifyStoreUrl: input.shopifyStoreUrl ?? null,
    websiteUrl: input.websiteUrl ?? null,
  };
}

async function ensureBrandProfile() {
  const existing = await prisma.brandProfile.findFirst({
    orderBy: { createdAt: "asc" },
    include: {
      personas: {
        orderBy: { createdAt: "asc" },
      },
      sellingPoints: {
        orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
      },
    },
  });
  if (existing) return existing;

  return prisma.brandProfile.create({
    data: normalizePayload(DEFAULT_PROFILE),
    include: {
      personas: {
        orderBy: { createdAt: "asc" },
      },
      sellingPoints: {
        orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
      },
    },
  });
}

export async function GET() {
  try {
    const profile = await ensureBrandProfile();
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load brand profile",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<BrandProfilePayload>;
    const normalized = normalizePayload(body);

    if (!normalized.brandName) {
      return NextResponse.json({ error: "brandName is required" }, { status: 400 });
    }
    if (!normalized.industryVertical) {
      return NextResponse.json({ error: "industryVertical is required" }, { status: 400 });
    }
    if (!normalized.pricePositioning) {
      return NextResponse.json({ error: "pricePositioning is required" }, { status: 400 });
    }

    const profile = await ensureBrandProfile();
    const updated = await prisma.brandProfile.update({
      where: { id: profile.id },
      data: normalized,
      include: {
        personas: {
          orderBy: { createdAt: "asc" },
        },
        sellingPoints: {
          orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
        },
      },
    });

    return NextResponse.json({ profile: updated });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to update brand profile",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
