-- Migration baseline audit repair.
--
-- The repository was missing earlier migration files that originally created
-- the base app, Brain/brand, Shopify sync, and CampaignMemory tables. This
-- additive migration lets a fresh database created from the current repository
-- reach the current Prisma schema while remaining safe for existing databases
-- where those tables/constraints/indexes already exist.
--
-- Do not replace this with db push/db execute/reset. Future schema changes
-- should be represented by normal Prisma migrations.

-- CreateTable
CREATE TABLE IF NOT EXISTS "Customer" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastOrderDate" TIMESTAMP(3),
    "firstOrderDate" TIMESTAMP(3),
    "recencyScore" INTEGER,
    "frequencyScore" INTEGER,
    "monetaryScore" INTEGER,
    "segment" TEXT,
    "churnRiskScore" INTEGER,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Order" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "customerId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Product" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "category" TEXT,
    "imageUrl" TEXT,
    "avgReplenishmentDays" INTEGER,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerEvent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "properties" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "flowConfig" JSONB,
    "subject" TEXT,
    "body" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CampaignReceipt" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "revenue" DOUBLE PRECISION,

    CONSTRAINT "CampaignReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CampaignMetrics" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "clicked" INTEGER NOT NULL DEFAULT 0,
    "converted" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unsubscribed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CampaignMemory" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campaignType" TEXT,
    "subjectLine" TEXT,
    "previewText" TEXT,
    "segment" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "audienceSize" INTEGER,
    "openRate" DOUBLE PRECISION,
    "clickRate" DOUBLE PRECISION,
    "conversionRate" DOUBLE PRECISION,
    "orders" INTEGER,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenuePerRecipient" DOUBLE PRECISION,
    "notes" TEXT,
    "winningInsight" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MessageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IntegrationState" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncMessage" TEXT,
    "syncInProgress" BOOLEAN NOT NULL DEFAULT false,
    "shopifyLastOrdersSyncAt" TIMESTAMP(3),
    "shopifyLastProductsSyncAt" TIMESTAMP(3),
    "shopifyLastCustomersSyncAt" TIMESTAMP(3),
    "shopifyLastRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ShopifySyncRun" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "triggeredBy" TEXT,
    "isBackground" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sinceOrdersAt" TIMESTAMP(3),
    "sinceProductsAt" TIMESTAMP(3),
    "customersFetched" INTEGER NOT NULL DEFAULT 0,
    "productsFetched" INTEGER NOT NULL DEFAULT 0,
    "ordersFetched" INTEGER NOT NULL DEFAULT 0,
    "customersUpserted" INTEGER NOT NULL DEFAULT 0,
    "productsUpserted" INTEGER NOT NULL DEFAULT 0,
    "ordersUpserted" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifySyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrandProfile" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT 'default',
    "brandName" TEXT,
    "tagline" TEXT,
    "industry" TEXT,
    "niche" TEXT,
    "brandStory" TEXT,
    "usp" TEXT,
    "missionStatement" TEXT,
    "websiteUrl" TEXT,
    "shopifyUrl" TEXT,
    "industryVertical" TEXT,
    "pricePositioning" TEXT,
    "foundedYear" INTEGER,
    "coreValues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shopifyStoreUrl" TEXT,
    "targetDemographics" TEXT,
    "targetPsychographics" TEXT,
    "audiencePainPoints" TEXT,
    "audienceDesires" TEXT,
    "voiceFormalCasual" INTEGER NOT NULL DEFAULT 50,
    "voiceSeriousPlayful" INTEGER NOT NULL DEFAULT 50,
    "voiceReservedEnthusiastic" INTEGER NOT NULL DEFAULT 50,
    "voiceTechnicalSimple" INTEGER NOT NULL DEFAULT 50,
    "voiceAuthoritativeApproachable" INTEGER NOT NULL DEFAULT 50,
    "voiceMinimalDescriptive" INTEGER NOT NULL DEFAULT 50,
    "voiceLuxuryAccessible" INTEGER NOT NULL DEFAULT 50,
    "voiceEdgySafe" INTEGER NOT NULL DEFAULT 50,
    "voiceEmotionalRational" INTEGER NOT NULL DEFAULT 50,
    "voiceTrendyTimeless" INTEGER NOT NULL DEFAULT 50,
    "voiceDescription" TEXT,
    "greetingStyle" TEXT DEFAULT 'friendly',
    "signOffStyle" TEXT DEFAULT 'warm',
    "emojiUsage" TEXT DEFAULT 'sparingly',
    "preferredLength" TEXT DEFAULT 'medium',
    "discountPhilosophy" TEXT DEFAULT 'strategically',
    "lastStoreAnalysis" TIMESTAMP(3),
    "storeAnalysisData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomVoiceDimension" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "leftLabel" TEXT NOT NULL,
    "rightLabel" TEXT NOT NULL,
    "description" TEXT,
    "value" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomVoiceDimension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrandCTA" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isPreferred" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandCTA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrandPhrase" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandPhrase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrandRule" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'important',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrandProfileMeta" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "BrandProfileMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Persona" (
    "id" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "ageRange" TEXT,
    "genderSkew" TEXT,
    "locationPatterns" TEXT[],
    "incomeLevel" TEXT,
    "lifestyle" TEXT[],
    "values" TEXT[],
    "interests" TEXT[],
    "painPoints" TEXT[],
    "motivations" TEXT[],
    "objections" TEXT[],
    "languageTheyUse" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SellingPoint" (
    "id" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "VoiceTone" (
    "id" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "formalCasual" INTEGER NOT NULL DEFAULT 5,
    "seriousPlayful" INTEGER NOT NULL DEFAULT 5,
    "reservedEnthusiastic" INTEGER NOT NULL DEFAULT 5,
    "technicalSimple" INTEGER NOT NULL DEFAULT 5,
    "traditionalEdgy" INTEGER NOT NULL DEFAULT 5,
    "corporatePersonal" INTEGER NOT NULL DEFAULT 5,
    "welcomeTone" JSONB,
    "promotionalTone" JSONB,
    "educationalTone" JSONB,
    "vipTone" JSONB,
    "winbackTone" JSONB,
    "transactionalTone" JSONB,
    "apologyTone" JSONB,
    "launchTone" JSONB,
    "sentenceLength" TEXT,
    "paragraphLength" TEXT,
    "useContractions" TEXT,
    "useExclamations" TEXT,
    "emojiUsage" JSONB,
    "useCaps" TEXT,
    "preferredAdjectives" TEXT[],
    "preferredVerbs" TEXT[],
    "preferredCTAs" TEXT[],
    "signaturePhrases" TEXT[],
    "greetingStyle" TEXT,
    "signoffStyle" TEXT,
    "customerReference" TEXT,
    "brandReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceTone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DosAndDonts" (
    "id" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "messagingDos" JSONB,
    "languageDos" JSONB,
    "complianceDos" JSONB,
    "designDos" JSONB,
    "timingDos" JSONB,
    "messagingDonts" JSONB,
    "languageDonts" JSONB,
    "complianceDonts" JSONB,
    "designDonts" JSONB,
    "toneDonts" JSONB,
    "cautionRules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DosAndDonts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductIntelligence" (
    "id" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "descriptionStyle" TEXT,
    "priceMentionRule" TEXT,
    "products" JSONB,
    "collections" JSONB,
    "heroProducts" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductIntelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Compliance" (
    "id" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "physicalAddress" TEXT,
    "unsubscribeText" TEXT,
    "smsOptOutText" TEXT,
    "privacyPolicyUrl" TEXT,
    "termsUrl" TEXT,
    "fdaDisclaimer" TEXT,
    "prop65Warning" TEXT,
    "subscriptionDisclosure" TEXT,
    "autoRenewalLanguage" TEXT,
    "customDisclaimers" TEXT[],
    "trademarkRules" TEXT,
    "ugcRightsText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Compliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SeasonalContext" (
    "id" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "celebratedHolidays" TEXT[],
    "skippedHolidays" TEXT[],
    "brandAnniversary" TIMESTAMP(3),
    "plannedSales" JSONB,
    "blackoutDates" TIMESTAMP(3)[],
    "blackoutTopics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonalContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrandDocument" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT 'default',
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileUrl" TEXT,
    "rawText" TEXT NOT NULL,
    "summary" TEXT,
    "extractedRules" TEXT,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "appliedToProfile" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StoreScreenshot" (
    "id" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "pageType" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "screenshotUrl" TEXT NOT NULL,
    "extractedElements" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreScreenshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT 'default',
    "title" TEXT DEFAULT 'New Chat',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Competitor" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "industry" TEXT,
    "niche" TEXT,
    "analysis" TEXT,
    "strengths" TEXT,
    "weaknesses" TEXT,
    "whatTheyDoBetter" TEXT,
    "messagingStrategy" TEXT,
    "pricingStrategy" TEXT,
    "emailStrategy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CompetitorEmail" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT 'default',
    "competitorId" TEXT,
    "competitorName" TEXT,
    "emailContent" TEXT NOT NULL,
    "analysis" TEXT,
    "subjectLine" TEXT,
    "emailType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_externalId_key" ON "Customer"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Order_externalId_key" ON "Order"("externalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Product_externalId_key" ON "Product"("externalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerEvent_customerId_createdAt_idx" ON "CustomerEvent"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerEvent_eventType_createdAt_idx" ON "CustomerEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignReceipt_campaignId_status_idx" ON "CampaignReceipt"("campaignId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignReceipt_customerId_idx" ON "CampaignReceipt"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignMetrics_campaignId_key" ON "CampaignMetrics"("campaignId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignMemory_campaignId_idx" ON "CampaignMemory"("campaignId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignMemory_sentAt_idx" ON "CampaignMemory"("sentAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignMemory_segment_sentAt_idx" ON "CampaignMemory"("segment", "sentAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignMemory_campaignType_sentAt_idx" ON "CampaignMemory"("campaignType", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationState_provider_key" ON "IntegrationState"("provider");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShopifySyncRun_status_createdAt_idx" ON "ShopifySyncRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BrandProfile_storeId_key" ON "BrandProfile"("storeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomVoiceDimension_storeId_createdAt_idx" ON "CustomVoiceDimension"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrandCTA_storeId_createdAt_idx" ON "BrandCTA"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrandPhrase_storeId_type_createdAt_idx" ON "BrandPhrase"("storeId", "type", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrandRule_storeId_type_priority_createdAt_idx" ON "BrandRule"("storeId", "type", "priority", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BrandProfileMeta_storeId_key" ON "BrandProfileMeta"("storeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Persona_brandProfileId_createdAt_idx" ON "Persona"("brandProfileId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SellingPoint_brandProfileId_type_sortOrder_idx" ON "SellingPoint"("brandProfileId", "type", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VoiceTone_brandProfileId_key" ON "VoiceTone"("brandProfileId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DosAndDonts_brandProfileId_key" ON "DosAndDonts"("brandProfileId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductIntelligence_brandProfileId_key" ON "ProductIntelligence"("brandProfileId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Compliance_brandProfileId_key" ON "Compliance"("brandProfileId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SeasonalContext_brandProfileId_key" ON "SeasonalContext"("brandProfileId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrandDocument_storeId_createdAt_idx" ON "BrandDocument"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StoreScreenshot_brandProfileId_capturedAt_idx" ON "StoreScreenshot"("brandProfileId", "capturedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatSession_storeId_updatedAt_idx" ON "ChatSession"("storeId", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Competitor_storeId_updatedAt_idx" ON "Competitor"("storeId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Competitor_storeId_url_key" ON "Competitor"("storeId", "url");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetitorEmail_storeId_createdAt_idx" ON "CompetitorEmail"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetitorEmail_competitorId_idx" ON "CompetitorEmail"("competitorId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Order_customerId_fkey'
    ) THEN
        ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_orderId_fkey'
    ) THEN
        ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_productId_fkey'
    ) THEN
        ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CustomerEvent_customerId_fkey'
    ) THEN
        ALTER TABLE "CustomerEvent" ADD CONSTRAINT "CustomerEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CampaignReceipt_campaignId_fkey'
    ) THEN
        ALTER TABLE "CampaignReceipt" ADD CONSTRAINT "CampaignReceipt_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CampaignReceipt_customerId_fkey'
    ) THEN
        ALTER TABLE "CampaignReceipt" ADD CONSTRAINT "CampaignReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CampaignMetrics_campaignId_fkey'
    ) THEN
        ALTER TABLE "CampaignMetrics" ADD CONSTRAINT "CampaignMetrics_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Persona_brandProfileId_fkey'
    ) THEN
        ALTER TABLE "Persona" ADD CONSTRAINT "Persona_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SellingPoint_brandProfileId_fkey'
    ) THEN
        ALTER TABLE "SellingPoint" ADD CONSTRAINT "SellingPoint_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'VoiceTone_brandProfileId_fkey'
    ) THEN
        ALTER TABLE "VoiceTone" ADD CONSTRAINT "VoiceTone_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DosAndDonts_brandProfileId_fkey'
    ) THEN
        ALTER TABLE "DosAndDonts" ADD CONSTRAINT "DosAndDonts_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ProductIntelligence_brandProfileId_fkey'
    ) THEN
        ALTER TABLE "ProductIntelligence" ADD CONSTRAINT "ProductIntelligence_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Compliance_brandProfileId_fkey'
    ) THEN
        ALTER TABLE "Compliance" ADD CONSTRAINT "Compliance_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SeasonalContext_brandProfileId_fkey'
    ) THEN
        ALTER TABLE "SeasonalContext" ADD CONSTRAINT "SeasonalContext_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_sessionId_fkey'
    ) THEN
        ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CompetitorEmail_competitorId_fkey'
    ) THEN
        ALTER TABLE "CompetitorEmail" ADD CONSTRAINT "CompetitorEmail_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
