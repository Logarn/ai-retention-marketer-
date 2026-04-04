import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const profile = await prisma.brandProfile.findFirst({
      orderBy: { updatedAt: "desc" },
      include: {
        personas: true,
        voiceTone: true,
        dosAndDonts: true,
        productIntelligence: true,
        compliance: true,
        sellingPoints: true,
        documents: true,
      },
    });

    if (!profile) {
      return NextResponse.json({
        profile: {
          id: null,
          brandName: "Unconfigured brand",
          industryVertical: "unknown",
          pricePositioning: "unknown",
          profileCompletion: 0,
          voiceCompletion: 0,
          rulesCompletion: 0,
          productsCompletion: 0,
          complianceCompletion: 0,
          createdAt: null,
          updatedAt: null,
        },
        freshness: {
          lastUpdatedAt: null,
          status: "empty",
        },
        quickStats: {
          personas: 0,
          sellingPoints: 0,
          documents: 0,
          requiredFieldsComplete: 0,
          requiredFieldsTotal: 5,
        },
        alerts: ["Create your Brand Profile to start building Sauti's intelligence base."],
      });
    }

    const profileScore = [
      Boolean(profile.brandName),
      Boolean(profile.industryVertical),
      Boolean(profile.pricePositioning),
      Boolean(profile.tagline),
      Boolean(profile.brandStory),
      Boolean(profile.missionStatement),
      (profile.coreValues?.length ?? 0) > 0,
      (profile.personas?.length ?? 0) > 0,
    ].filter(Boolean).length;
    const voiceScore = profile.voiceTone
      ? [
          profile.voiceTone.formalCasual,
          profile.voiceTone.seriousPlayful,
          profile.voiceTone.reservedEnthusiastic,
          profile.voiceTone.technicalSimple,
          profile.voiceTone.traditionalEdgy,
          profile.voiceTone.corporatePersonal,
          profile.voiceTone.greetingStyle,
          profile.voiceTone.signoffStyle,
        ].filter(Boolean).length
      : 0;
    const rulesScore = profile.dosAndDonts
      ? [
          profile.dosAndDonts.messagingDos,
          profile.dosAndDonts.languageDos,
          profile.dosAndDonts.complianceDos,
          profile.dosAndDonts.designDos,
          profile.dosAndDonts.timingDos,
          profile.dosAndDonts.messagingDonts,
          profile.dosAndDonts.languageDonts,
          profile.dosAndDonts.complianceDonts,
          profile.dosAndDonts.designDonts,
          profile.dosAndDonts.toneDonts,
        ].filter(Boolean).length
      : 0;
    const productScore = profile.productIntelligence
      ? [
          profile.productIntelligence.descriptionStyle,
          profile.productIntelligence.priceMentionRule,
          profile.productIntelligence.products,
          profile.productIntelligence.collections,
          (profile.productIntelligence.heroProducts?.length ?? 0) > 0,
        ].filter(Boolean).length
      : 0;
    const complianceScore = profile.compliance
      ? [
          profile.compliance.physicalAddress,
          profile.compliance.unsubscribeText,
          profile.compliance.smsOptOutText,
          profile.compliance.privacyPolicyUrl,
          profile.compliance.termsUrl,
        ].filter(Boolean).length
      : 0;

    const profileCompletion = Math.round((profileScore / 8) * 100);
    const voiceCompletion = Math.round((voiceScore / 8) * 100);
    const rulesCompletion = Math.round((rulesScore / 10) * 100);
    const productsCompletion = Math.round((productScore / 5) * 100);
    const complianceCompletion = Math.round((complianceScore / 5) * 100);

    const requiredFieldsTotal = 5;
    const requiredFieldsComplete = [
      Boolean(profile.brandName),
      Boolean(profile.industryVertical),
      Boolean(profile.pricePositioning),
      Boolean(profile.brandStory),
      Boolean(profile.missionStatement),
    ].filter(Boolean).length;

    const profileUpdatedAt = profile.updatedAt.toISOString();
    const staleThresholdMs = 1000 * 60 * 60 * 24 * 7;
    const freshnessStatus =
      Date.now() - profile.updatedAt.getTime() > staleThresholdMs ? "stale" : "fresh";

    const alerts: string[] = [];
    if ((profile.personas?.length ?? 0) === 0) {
      alerts.push("Add at least one target persona to sharpen campaign messaging.");
    }
    if (!profile.voiceTone) {
      alerts.push("Set Voice & Tone sliders to keep generated copy consistently on-brand.");
    }
    if ((profile.documents?.length ?? 0) === 0) {
      alerts.push("Upload brand docs to accelerate intelligence extraction.");
    }

    const toStatus = (score: number): "not_started" | "in_progress" | "complete" => {
      if (score >= 100) return "complete";
      if (score > 0) return "in_progress";
      return "not_started";
    };

    return NextResponse.json({
      profile: {
        id: profile.id,
        brandName: profile.brandName,
        industryVertical: profile.industryVertical,
        pricePositioning: profile.pricePositioning,
        profileCompletion,
        voiceCompletion,
        rulesCompletion,
        productsCompletion,
        complianceCompletion,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profileUpdatedAt,
      },
      freshness: {
        lastUpdatedAt: profileUpdatedAt,
        status: freshnessStatus,
      },
      sections: {
        overview: {
          status:
            requiredFieldsComplete >= requiredFieldsTotal
              ? "complete"
              : requiredFieldsComplete > 0
                ? "in_progress"
                : "not_started",
          score: Math.round((requiredFieldsComplete / Math.max(1, requiredFieldsTotal)) * 100),
        },
        profile: {
          status: toStatus(profileCompletion),
          score: profileCompletion,
        },
        voice: {
          status: toStatus(voiceCompletion),
          score: voiceCompletion,
        },
        rules: {
          status: toStatus(rulesCompletion),
          score: rulesCompletion,
        },
        analyzer: {
          status: profile.lastStoreAnalysis ? "in_progress" : "not_started",
          score: profile.lastStoreAnalysis ? 20 : 0,
          lastAnalyzedAt: profile.lastStoreAnalysis?.toISOString() ?? null,
        },
        documents: {
          status:
            profile.documents.length === 0
              ? "not_started"
              : profile.documents.some((doc) => doc.appliedToBrand)
                ? "complete"
                : "in_progress",
          score:
            profile.documents.length === 0
              ? 0
              : Math.min(
                  100,
                  Math.round(
                    (profile.documents.filter((doc) => doc.appliedToBrand).length /
                      Math.max(1, profile.documents.length)) *
                      100,
                  ),
                ),
          totalDocuments: profile.documents.length,
          appliedDocuments: profile.documents.filter((doc) => doc.appliedToBrand).length,
        },
      },
      quickStats: {
        personas: profile.personas.length,
        documents: profile.documents.length,
        sellingPoints: profile.sellingPoints.length,
        requiredFieldsComplete,
        requiredFieldsTotal,
      },
      alerts,
    });
  } catch (error) {
    console.error("[brain-overview] GET failed", error);
    return NextResponse.json(
      {
        error: "Failed to load brain overview",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
