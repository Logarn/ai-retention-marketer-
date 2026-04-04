import { prisma } from "@/lib/prisma";

export const DEFAULT_STORE_ID = "default";

export async function ensureBrandProfileForStore(storeId = DEFAULT_STORE_ID) {
  const existing = await prisma.brandProfile.findUnique({
    where: { storeId },
  });
  if (existing) return existing;

  return prisma.brandProfile.create({
    data: {
      storeId,
      brandName: "Your Brand",
      industry: "skincare",
      greetingStyle: "friendly",
      signOffStyle: "warm",
      emojiUsage: "sparingly",
      preferredLength: "medium",
      discountPhilosophy: "strategically",
    },
  });
}
