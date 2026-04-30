import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const QA_RULESET_VERSION = "qa-engine-v0";
const DEFAULT_STORE_ID = "default";

export const briefQaInclude = {
  planItem: {
    select: {
      id: true,
      campaignType: true,
      primaryProduct: true,
      metadata: true,
    },
  },
  sections: {
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.CampaignBriefInclude;

type BriefForQa = Prisma.CampaignBriefGetPayload<{
  include: typeof briefQaInclude;
}>;

type QaStatus = "passed" | "warning" | "failed";

type QaMessage = {
  code: string;
  message: string;
  field?: string;
  metadata?: Record<string, unknown>;
};

type PassedCheck = {
  code: string;
  message: string;
};

type QaRunResult = {
  status: QaStatus;
  score: number;
  issues: QaMessage[];
  warnings: QaMessage[];
  passedChecks: PassedCheck[];
  recommendedNextAction: string;
  metadata: Record<string, unknown>;
};

type BrainGuidanceTerm = {
  term: string;
  source: string;
  rule?: string;
};

type BrainGuidance = {
  available: boolean;
  skippedReason: string | null;
  forbiddenTerms: BrainGuidanceTerm[];
  cautionTerms: BrainGuidanceTerm[];
  requiredPhrases: BrainGuidanceTerm[];
  noDiscountRule: boolean;
  sourceCounts: Record<string, number>;
  loadErrors: string[];
};

const RISKY_WORD_PATTERNS: Array<{ code: string; label: string; pattern: RegExp }> = [
  { code: "spam_free_money", label: "free money", pattern: /\bfree money\b/i },
  { code: "spam_guaranteed", label: "guaranteed", pattern: /\bguaranteed\b/i },
  { code: "spam_risk_free", label: "risk-free", pattern: /\brisk[-\s]?free\b/i },
  { code: "spam_act_now", label: "act now", pattern: /\bact now\b/i },
  { code: "spam_winner", label: "winner", pattern: /\bwinner\b/i },
  { code: "spam_miracle", label: "miracle", pattern: /\bmiracle\b/i },
  { code: "spam_no_strings", label: "no strings attached", pattern: /\bno strings attached\b/i },
  { code: "spam_urgent", label: "urgent", pattern: /\burgent\b/i },
  { code: "spam_cash_bonus", label: "cash bonus", pattern: /\bcash bonus\b/i },
  { code: "spam_buy_now", label: "buy now", pattern: /\bbuy now\b/i },
];

const DISCOUNT_LANGUAGE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "discount", pattern: /\bdiscounts?\b/i },
  { label: "coupon", pattern: /\bcoupons?\b/i },
  { label: "promo code", pattern: /\bpromo\s+codes?\b/i },
  { label: "bogo", pattern: /\bbogo\b|\bbuy\s+one\b.*\bget\s+one\b/i },
  { label: "percent off", pattern: /\b\d{1,2}%\s*off\b/i },
  { label: "dollars off", pattern: /\$\d+\s*off\b/i },
  { label: "sale", pattern: /\bsale\b/i },
  { label: "markdown", pattern: /\bmarkdowns?\b/i },
  { label: "clearance", pattern: /\bclearance\b/i },
  { label: "deal", pattern: /\bdeals?\b/i },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").trim();
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function addIssue(issues: QaMessage[], code: string, message: string, field?: string, metadata?: Record<string, unknown>) {
  issues.push({ code, message, field, metadata });
}

function addWarning(
  warnings: QaMessage[],
  code: string,
  message: string,
  field?: string,
  metadata?: Record<string, unknown>,
) {
  warnings.push({ code, message, field, metadata });
}

function addPass(passedChecks: PassedCheck[], code: string, message: string) {
  passedChecks.push({ code, message });
}

function sectionMatchesType(sectionType: string, target: string) {
  return normalize(sectionType).includes(target);
}

function collectBriefText(brief: BriefForQa) {
  const entries: Array<{ field: string; text: string }> = [];
  for (const [index, subjectLine] of asStringArray(brief.subjectLines).entries()) {
    entries.push({ field: `subjectLines.${index}`, text: subjectLine });
  }
  for (const [index, previewText] of asStringArray(brief.previewTexts).entries()) {
    entries.push({ field: `previewTexts.${index}`, text: previewText });
  }
  entries.push({ field: "title", text: brief.title });
  entries.push({ field: "campaignType", text: brief.campaignType });
  entries.push({ field: "segment", text: brief.segment });
  entries.push({ field: "goal", text: brief.goal });
  entries.push({ field: "angle", text: brief.angle });
  if (brief.primaryProduct) entries.push({ field: "primaryProduct", text: brief.primaryProduct });
  if (brief.cta) entries.push({ field: "cta", text: brief.cta });
  if (brief.designNotes) entries.push({ field: "designNotes", text: brief.designNotes });
  for (const section of brief.sections) {
    if (section.heading) entries.push({ field: `sections.${section.id}.heading`, text: section.heading });
    entries.push({ field: `sections.${section.id}.body`, text: section.body });
  }
  return entries.filter((entry) => entry.text.trim());
}

function collectBrandComplianceText(brief: BriefForQa) {
  const entries: Array<{ field: string; text: string }> = [
    { field: "title", text: brief.title },
    { field: "angle", text: brief.angle },
  ];
  for (const [index, subjectLine] of asStringArray(brief.subjectLines).entries()) {
    entries.push({ field: `subjectLines.${index}`, text: subjectLine });
  }
  for (const [index, previewText] of asStringArray(brief.previewTexts).entries()) {
    entries.push({ field: `previewTexts.${index}`, text: previewText });
  }
  if (brief.cta) entries.push({ field: "cta", text: brief.cta });
  for (const section of brief.sections) {
    entries.push({ field: `sections.${section.id}.body`, text: section.body });
  }
  return entries.filter((entry) => entry.text.trim());
}

function findRiskyWords(brief: BriefForQa) {
  const matches: Array<{ code: string; label: string; field: string }> = [];
  for (const entry of collectBriefText(brief)) {
    for (const riskyWord of RISKY_WORD_PATTERNS) {
      if (riskyWord.pattern.test(entry.text)) {
        matches.push({ code: riskyWord.code, label: riskyWord.label, field: entry.field });
      }
    }
  }
  return matches;
}

function findDiscountLanguage(brief: BriefForQa) {
  const matches: Array<{ label: string; field: string }> = [];
  for (const entry of collectBriefText(brief)) {
    for (const pattern of DISCOUNT_LANGUAGE_PATTERNS) {
      if (pattern.pattern.test(entry.text)) {
        matches.push({ label: pattern.label, field: entry.field });
      }
    }
  }
  return matches;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termPattern(term: string) {
  const escaped = escapeRegExp(term.trim()).replace(/\\ /g, "\\s+");
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i");
}

function findTermMatches(brief: BriefForQa, terms: BrainGuidanceTerm[]) {
  const uniqueTerms = new Map<string, BrainGuidanceTerm>();
  for (const term of terms) {
    const normalizedTerm = normalize(term.term);
    if (normalizedTerm.length >= 2 && !uniqueTerms.has(normalizedTerm)) {
      uniqueTerms.set(normalizedTerm, term);
    }
  }

  const matches: Array<{ term: string; source: string; field: string; rule?: string }> = [];
  for (const entry of collectBrandComplianceText(brief)) {
    for (const term of uniqueTerms.values()) {
      if (termPattern(term.term).test(entry.text)) {
        matches.push({
          term: term.term,
          source: term.source,
          field: entry.field,
          rule: term.rule,
        });
      }
    }
  }
  return matches;
}

function subjectHasCapsRisk(subjectLine: string) {
  const letters = subjectLine.replace(/[^A-Za-z]/g, "");
  if (letters.length < 10) return false;
  const upper = letters.replace(/[^A-Z]/g, "");
  return upper.length / letters.length >= 0.7;
}

function subjectHasPunctuationRisk(subjectLine: string) {
  const punctuationCount = (subjectLine.match(/[!?]/g) ?? []).length;
  return punctuationCount > 2 || /!!|\?\?|\?!|!\?/.test(subjectLine);
}

function findSubjectLineRisks(subjectLines: string[]) {
  const risks: Array<{ index: number; subjectLine: string; reason: string }> = [];
  subjectLines.forEach((subjectLine, index) => {
    if (subjectHasPunctuationRisk(subjectLine)) {
      risks.push({ index, subjectLine, reason: "excessive punctuation" });
    }
    if (subjectHasCapsRisk(subjectLine)) {
      risks.push({ index, subjectLine, reason: "excessive capitalization" });
    }
  });
  return risks;
}

function jsonHasNoDiscount(value: unknown, depth = 0): boolean {
  if (!value || depth > 8) return false;

  if (typeof value === "string") {
    return /\b(no|without|avoid)\b.*\b(discounts?|coupons?|promo\s+codes?|sales?|markdowns?|bogo|deals?)\b/i.test(
      value,
    );
  }

  if (typeof value === "boolean") return false;

  if (Array.isArray(value)) {
    return value.some((item) => jsonHasNoDiscount(item, depth + 1));
  }

  if (isRecord(value)) {
    return Object.entries(value).some(([key, nestedValue]) => {
      const normalizedKey = key.toLowerCase().replace(/[_-]/g, "");
      if (normalizedKey === "nodiscount") {
        return (
          nestedValue === true ||
          (typeof nestedValue === "string" && /^(true|yes|1|no discounts?)$/i.test(nestedValue.trim())) ||
          jsonHasNoDiscount(nestedValue, depth + 1)
        );
      }
      return jsonHasNoDiscount(nestedValue, depth + 1);
    });
  }

  return false;
}

function briefHasNoDiscountConstraint(brief: BriefForQa) {
  return jsonHasNoDiscount(brief.metadata) || jsonHasNoDiscount(brief.planItem?.metadata);
}

function textMentionsNoDiscount(value: string | null | undefined) {
  if (!value) return false;
  return /\b(no|without|avoid|never)\b.*\b(discounts?|coupons?|promo\s+codes?|sales?|markdowns?|bogo|deals?)\b/i.test(
    value,
  );
}

function campaignNeedsPrimaryProduct(brief: BriefForQa) {
  const campaignType = normalize(brief.campaignType);
  return (
    campaignType.includes("product") ||
    campaignType.includes("vip") ||
    campaignType.includes("cross sell") ||
    campaignType.includes("cross-sell") ||
    campaignType.includes("upsell")
  );
}

function recommendedNextAction(status: QaStatus) {
  if (status === "failed") return "Resolve blocking QA issues before moving this brief toward scheduling.";
  if (status === "warning") return "Review warnings with a human, make edits if needed, then rerun QA.";
  return "Brief QA passed and can move toward scheduling review.";
}

function scoreQaRun(issueCount: number, warningCount: number) {
  return Math.max(0, Math.min(100, 100 - issueCount * 16 - warningCount * 6));
}

async function withBrainFallback<T>(
  query: PromiseLike<T>,
  fallback: T,
  label: string,
  errors: string[],
): Promise<T> {
  try {
    return await query;
  } catch {
    errors.push(label);
    return fallback;
  }
}

function cleanGuidanceTerm(value: string) {
  return value
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectQuotedTerms(value: string) {
  const terms: string[] = [];
  const quotePattern = /["“”'‘’]([^"“”'‘’]{2,120})["“”'‘’]/g;
  let match: RegExpExecArray | null;
  while ((match = quotePattern.exec(value))) {
    const term = cleanGuidanceTerm(match[1]);
    if (term) terms.push(term);
  }
  return terms;
}

function extractDirectiveTerms(value: string, mode: "forbidden" | "required" | "caution") {
  const cleaned = cleanGuidanceTerm(value);
  if (!cleaned) return [];

  const terms = collectQuotedTerms(cleaned);
  const directivePatterns =
    mode === "required"
      ? [
          /\b(?:must|should|always)\s+(?:include|use|say|mention|show)\s+(.+)$/i,
          /\b(?:required|required phrase|include the phrase|use the phrase)\s+(.+)$/i,
        ]
      : mode === "forbidden"
        ? [
            /\b(?:do not|don't|dont|never|avoid|forbidden|no)\s+(?:say|use|mention|include|write)?\s*(.+)$/i,
            /\b(?:banned|forbidden)\s+(?:phrase|term|language|word)s?:?\s*(.+)$/i,
          ]
        : [
            /\b(?:be careful with|use caution with|caution|watch|review)\s+(.+)$/i,
            /\b(?:sensitive|risky)\s+(?:phrase|term|topic|language)s?:?\s*(.+)$/i,
          ];

  for (const pattern of directivePatterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      const term = cleanGuidanceTerm(match[1].replace(/\b(in copy|in emails?|in campaigns?)$/i, ""));
      if (term) terms.push(term);
    }
  }

  if (mode !== "required" && terms.length === 0 && cleaned.split(/\s+/).length <= 6 && cleaned.length <= 80) {
    terms.push(cleaned);
  }

  return Array.from(new Set(terms.map(cleanGuidanceTerm).filter((term) => term.length >= 2))).slice(0, 20);
}

function collectRuleText(input: unknown, output: string[]) {
  if (!input) return;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed) output.push(trimmed);
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectRuleText(item, output);
    return;
  }
  if (isRecord(input)) {
    if (typeof input.rule === "string") collectRuleText(input.rule, output);
    if (typeof input.text === "string") collectRuleText(input.text, output);
    if (typeof input.phrase === "string") collectRuleText(input.phrase, output);
  }
}

function addTermsFromRules(
  terms: BrainGuidanceTerm[],
  rules: string[],
  source: string,
  mode: "forbidden" | "required" | "caution",
) {
  for (const rule of rules) {
    for (const term of extractDirectiveTerms(rule, mode)) {
      terms.push({ term, source, rule });
    }
  }
}

export async function loadBrainGuidance(): Promise<BrainGuidance> {
  const loadErrors: string[] = [];
  const [profile, brandRules, brandPhrases, dosAndDonts, compliance, voiceTone] = await Promise.all([
    withBrainFallback(
      prisma.brandProfile.findUnique({
        where: { storeId: DEFAULT_STORE_ID },
        select: {
          brandName: true,
          voiceDescription: true,
          discountPhilosophy: true,
        },
      }),
      null,
      "brand profile",
      loadErrors,
    ),
    withBrainFallback(
      prisma.brandRule.findMany({
        where: { storeId: DEFAULT_STORE_ID },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        select: { rule: true, type: true, priority: true },
      }),
      [],
      "brand rules",
      loadErrors,
    ),
    withBrainFallback(
      prisma.brandPhrase.findMany({
        where: { storeId: DEFAULT_STORE_ID },
        orderBy: { createdAt: "desc" },
        select: { phrase: true, type: true },
      }),
      [],
      "brand phrases",
      loadErrors,
    ),
    withBrainFallback(
      prisma.dosAndDonts.findFirst({
        orderBy: { updatedAt: "desc" },
        select: {
          messagingDos: true,
          languageDos: true,
          complianceDos: true,
          messagingDonts: true,
          languageDonts: true,
          complianceDonts: true,
          toneDonts: true,
          cautionRules: true,
        },
      }),
      null,
      "dos and donts",
      loadErrors,
    ),
    withBrainFallback(
      prisma.compliance.findFirst({
        orderBy: { updatedAt: "desc" },
        select: {
          physicalAddress: true,
          unsubscribeText: true,
          trademarkRules: true,
          customDisclaimers: true,
        },
      }),
      null,
      "compliance",
      loadErrors,
    ),
    withBrainFallback(
      prisma.voiceTone.findFirst({
        orderBy: { updatedAt: "desc" },
        select: {
          preferredCTAs: true,
          signaturePhrases: true,
          useCaps: true,
          useExclamations: true,
        },
      }),
      null,
      "voice tone",
      loadErrors,
    ),
  ]);

  const forbiddenTerms: BrainGuidanceTerm[] = [];
  const cautionTerms: BrainGuidanceTerm[] = [];
  const requiredPhrases: BrainGuidanceTerm[] = [];
  const dontRules = brandRules.filter((rule) => rule.type === "dont").map((rule) => rule.rule);
  const doRules = brandRules.filter((rule) => rule.type === "do").map((rule) => rule.rule);
  const bannedPhrases = brandPhrases.filter((phrase) => phrase.type === "banned").map((phrase) => phrase.phrase);

  for (const phrase of bannedPhrases) {
    forbiddenTerms.push({ term: phrase, source: "BrandPhrase:banned" });
  }
  addTermsFromRules(forbiddenTerms, dontRules, "BrandRule:dont", "forbidden");
  addTermsFromRules(requiredPhrases, doRules, "BrandRule:do", "required");

  const dontText: string[] = [];
  const cautionText: string[] = [];
  const requiredText: string[] = [];
  if (dosAndDonts) {
    collectRuleText(dosAndDonts.messagingDonts, dontText);
    collectRuleText(dosAndDonts.languageDonts, dontText);
    collectRuleText(dosAndDonts.complianceDonts, dontText);
    collectRuleText(dosAndDonts.toneDonts, dontText);
    collectRuleText(dosAndDonts.cautionRules, cautionText);
    collectRuleText(dosAndDonts.messagingDos, requiredText);
    collectRuleText(dosAndDonts.languageDos, requiredText);
    collectRuleText(dosAndDonts.complianceDos, requiredText);
  }
  addTermsFromRules(forbiddenTerms, dontText, "DosAndDonts:dont", "forbidden");
  addTermsFromRules(cautionTerms, cautionText, "DosAndDonts:cautionRules", "caution");
  addTermsFromRules(requiredPhrases, requiredText, "DosAndDonts:dos", "required");

  if (compliance?.unsubscribeText) {
    requiredPhrases.push({ term: compliance.unsubscribeText, source: "Compliance:unsubscribeText" });
  }
  if (compliance?.physicalAddress) {
    requiredPhrases.push({ term: compliance.physicalAddress, source: "Compliance:physicalAddress" });
  }
  if (Array.isArray(compliance?.customDisclaimers)) {
    for (const disclaimer of compliance.customDisclaimers) {
      if (typeof disclaimer === "string" && disclaimer.trim()) {
        requiredPhrases.push({ term: disclaimer, source: "Compliance:customDisclaimers" });
      }
    }
  }
  if (compliance?.trademarkRules) {
    addTermsFromRules(cautionTerms, [compliance.trademarkRules], "Compliance:trademarkRules", "caution");
  }

  const noDiscountRule =
    textMentionsNoDiscount(profile?.discountPhilosophy) ||
    [...doRules, ...dontRules, ...dontText, ...cautionText, ...requiredText].some(textMentionsNoDiscount);
  const sourceCounts = {
    brandProfile: profile ? 1 : 0,
    brandRules: brandRules.length,
    brandPhrases: brandPhrases.length,
    dosAndDonts: dosAndDonts ? 1 : 0,
    compliance: compliance ? 1 : 0,
    voiceTone: voiceTone ? 1 : 0,
    forbiddenTerms: forbiddenTerms.length,
    cautionTerms: cautionTerms.length,
    requiredPhrases: requiredPhrases.length,
  };
  const available =
    sourceCounts.brandProfile +
      sourceCounts.brandRules +
      sourceCounts.brandPhrases +
      sourceCounts.dosAndDonts +
      sourceCounts.compliance +
      sourceCounts.voiceTone >
    0;

  return {
    available,
    skippedReason: available ? null : "Brain guidance unavailable; skipped brand compliance checks.",
    forbiddenTerms,
    cautionTerms,
    requiredPhrases,
    noDiscountRule,
    sourceCounts,
    loadErrors,
  };
}

export function runBriefQa(brief: BriefForQa, brainGuidance?: BrainGuidance): QaRunResult {
  const issues: QaMessage[] = [];
  const warnings: QaMessage[] = [];
  const passedChecks: PassedCheck[] = [];
  const subjectLines = asStringArray(brief.subjectLines);
  const previewTexts = asStringArray(brief.previewTexts);
  const metadataNoDiscountConstraint = briefHasNoDiscountConstraint(brief);
  const brainNoDiscountConstraint = Boolean(brainGuidance?.noDiscountRule);
  const noDiscountConstraint = metadataNoDiscountConstraint || brainNoDiscountConstraint;

  addPass(passedChecks, "brief_exists", "Campaign brief exists.");

  if (subjectLines.length) {
    addPass(passedChecks, "subject_lines_exist", "Subject lines are present.");
  } else {
    addIssue(issues, "subject_lines_missing", "Add at least one subject line before QA can pass.", "subjectLines");
  }

  if (previewTexts.length) {
    addPass(passedChecks, "preview_texts_exist", "Preview texts are present.");
  } else {
    addIssue(issues, "preview_texts_missing", "Add at least one preview text before QA can pass.", "previewTexts");
  }

  if (hasText(brief.cta)) {
    addPass(passedChecks, "cta_exists", "CTA is present.");
  } else {
    addIssue(issues, "cta_missing", "Add a primary CTA before QA can pass.", "cta");
  }

  if (brief.sections.length) {
    addPass(passedChecks, "sections_exist", "Brief sections are present.");
  } else {
    addIssue(issues, "sections_missing", "Add brief sections before QA can pass.", "sections");
  }

  const hasHeroSection = brief.sections.some((section) => sectionMatchesType(section.type, "hero"));
  if (hasHeroSection) {
    addPass(passedChecks, "hero_section_exists", "Hero section is present.");
  } else {
    addIssue(issues, "hero_section_missing", "Add a hero section before QA can pass.", "sections");
  }

  const hasCtaSection = brief.sections.some((section) => sectionMatchesType(section.type, "cta"));
  if (hasCtaSection) {
    addPass(passedChecks, "cta_section_exists", "CTA section is present.");
  } else {
    addIssue(issues, "cta_section_missing", "Add a CTA section before QA can pass.", "sections");
  }

  if (hasText(brief.designNotes)) {
    addPass(passedChecks, "design_notes_exist", "Design notes are present.");
  } else {
    addWarning(warnings, "design_notes_missing", "Add design notes so creative QA has layout guidance.", "designNotes");
  }

  const emptySections = brief.sections.filter((section) => !section.body.trim());
  if (emptySections.length) {
    addIssue(issues, "empty_section_body", "Every section needs a non-empty body.", "sections", {
      sectionIds: emptySections.map((section) => section.id),
    });
  } else if (brief.sections.length) {
    addPass(passedChecks, "section_bodies_not_empty", "All section bodies are non-empty.");
  }

  if (noDiscountConstraint) {
    const discountMatches = findDiscountLanguage(brief);
    if (discountMatches.length) {
      addIssue(
        issues,
        "discount_language_blocked",
        "This brief has a no-discount constraint but contains discount language.",
        "content",
        {
          sources: {
            briefMetadata: metadataNoDiscountConstraint,
            brainGuidance: brainNoDiscountConstraint,
          },
          matches: discountMatches.slice(0, 12),
        },
      );
    } else {
      addPass(passedChecks, "no_discount_language", "No discount language found for the no-discount constraint.");
    }
  } else {
    addPass(passedChecks, "discount_constraint_not_required", "No no-discount constraint detected.");
  }

  const riskyWordMatches = findRiskyWords(brief);
  if (riskyWordMatches.length) {
    addWarning(warnings, "spammy_or_risky_words", "Review risky words that can hurt inbox placement.", "content", {
      matches: riskyWordMatches.slice(0, 12),
    });
  } else {
    addPass(passedChecks, "no_spammy_words", "No basic risky words found.");
  }

  const subjectLineRisks = findSubjectLineRisks(subjectLines);
  if (subjectLineRisks.length) {
    addWarning(
      warnings,
      "subject_line_formatting_risk",
      "Review subject lines with excessive punctuation or capitalization.",
      "subjectLines",
      {
        risks: subjectLineRisks,
      },
    );
  } else if (subjectLines.length) {
    addPass(passedChecks, "subject_line_formatting_ok", "Subject line punctuation and capitalization look safe.");
  }

  if (campaignNeedsPrimaryProduct(brief) && !hasText(brief.primaryProduct)) {
    addWarning(
      warnings,
      "primary_product_missing",
      "Product, VIP, cross-sell, and upsell briefs should usually name a primary product.",
      "primaryProduct",
    );
  } else if (campaignNeedsPrimaryProduct(brief)) {
    addPass(passedChecks, "primary_product_exists", "Primary product is present for this campaign type.");
  }

  let brandCompliance: Record<string, unknown>;
  if (!brainGuidance?.available) {
    addPass(
      passedChecks,
      "brain_guidance_unavailable",
      brainGuidance?.skippedReason ?? "Brain guidance unavailable; skipped brand compliance checks.",
    );
    brandCompliance = {
      available: false,
      skippedReason: brainGuidance?.skippedReason ?? "Brain guidance unavailable; skipped brand compliance checks.",
      loadErrors: brainGuidance?.loadErrors ?? [],
    };
  } else {
    const forbiddenMatches = findTermMatches(brief, brainGuidance.forbiddenTerms);
    const cautionMatches = findTermMatches(brief, brainGuidance.cautionTerms);
    const requiredPhraseMissing = brainGuidance.requiredPhrases
      .filter((phrase) => findTermMatches(brief, [phrase]).length === 0)
      .map((phrase) => ({ term: phrase.term, source: phrase.source, rule: phrase.rule }));

    if (forbiddenMatches.length) {
      addIssue(
        issues,
        "brand_forbidden_language",
        "Brief contains language forbidden by Brain/brand guidance.",
        "content",
        { matches: forbiddenMatches.slice(0, 12) },
      );
    } else {
      addPass(passedChecks, "brand_forbidden_language_clear", "No forbidden Brain/brand terms found.");
    }

    if (cautionMatches.length) {
      addWarning(
        warnings,
        "brand_caution_terms",
        "Brief contains caution terms from Brain/brand guidance.",
        "content",
        { matches: cautionMatches.slice(0, 12) },
      );
    } else if (brainGuidance.cautionTerms.length) {
      addPass(passedChecks, "brand_caution_terms_clear", "No Brain caution terms found.");
    }

    if (requiredPhraseMissing.length) {
      addWarning(
        warnings,
        "brand_required_phrases_missing",
        "Brain/compliance guidance includes required phrases that are missing from this brief.",
        "content",
        { missing: requiredPhraseMissing.slice(0, 12) },
      );
    } else if (brainGuidance.requiredPhrases.length) {
      addPass(passedChecks, "brand_required_phrases_present", "Required Brain/compliance phrases are present.");
    }

    if (brainGuidance.noDiscountRule) {
      addPass(passedChecks, "brain_discount_guidance_checked", "Brain discount guidance was checked.");
    }

    brandCompliance = {
      available: true,
      sourceCounts: brainGuidance.sourceCounts,
      loadErrors: brainGuidance.loadErrors,
      noDiscountRule: brainGuidance.noDiscountRule,
      forbiddenMatches: forbiddenMatches.slice(0, 12),
      cautionMatches: cautionMatches.slice(0, 12),
      requiredPhraseMissing: requiredPhraseMissing.slice(0, 12),
    };
  }

  const status: QaStatus = issues.length ? "failed" : warnings.length ? "warning" : "passed";
  const score = scoreQaRun(issues.length, warnings.length);

  return {
    status,
    score,
    issues,
    warnings,
    passedChecks,
    recommendedNextAction: recommendedNextAction(status),
    metadata: {
      ruleset: QA_RULESET_VERSION,
      noDiscountConstraint,
      brandCompliance,
      checkedAt: new Date().toISOString(),
      recommendedNextAction: recommendedNextAction(status),
      counts: {
        issues: issues.length,
        warnings: warnings.length,
        passedChecks: passedChecks.length,
      },
    },
  };
}

function readRecommendedNextAction(metadata: Prisma.JsonValue | null, status: string) {
  if (isRecord(metadata) && typeof metadata.recommendedNextAction === "string") {
    return metadata.recommendedNextAction;
  }
  if (status === "failed" || status === "warning" || status === "passed") {
    return recommendedNextAction(status);
  }
  return "Review QA result before moving this brief forward.";
}

function asJsonArray(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value : [];
}

export function serializeBriefQaCheck(check: {
  id: string;
  briefId: string;
  status: string;
  score: number;
  issues: Prisma.JsonValue;
  warnings: Prisma.JsonValue;
  passedChecks: Prisma.JsonValue;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: check.id,
    briefId: check.briefId,
    status: check.status,
    score: check.score,
    issues: asJsonArray(check.issues),
    warnings: asJsonArray(check.warnings),
    passedChecks: asJsonArray(check.passedChecks),
    recommendedNextAction: readRecommendedNextAction(check.metadata, check.status),
    metadata: check.metadata,
    createdAt: check.createdAt.toISOString(),
    updatedAt: check.updatedAt.toISOString(),
  };
}

export async function parseOptionalQaRunBody(
  request: Request,
): Promise<{ ok: true; metadata: Record<string, unknown> | null } | { ok: false; issues: string[] }> {
  const raw = await request.text().catch(() => "");
  if (!raw.trim()) return { ok: true, metadata: null };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null) return { ok: true, metadata: null };
    if (!isRecord(parsed)) {
      return { ok: false, issues: ["Request body must be a JSON object when provided."] };
    }
    if (parsed.metadata !== undefined && !isRecord(parsed.metadata)) {
      return { ok: false, issues: ["metadata must be a JSON object when provided."] };
    }
    return { ok: true, metadata: (parsed.metadata as Record<string, unknown> | undefined) ?? null };
  } catch {
    return { ok: false, issues: ["Request body must be valid JSON."] };
  }
}

export function cleanBriefId(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}
