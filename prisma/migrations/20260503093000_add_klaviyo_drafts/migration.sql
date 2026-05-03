-- CreateTable
CREATE TABLE "KlaviyoDraft" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "klaviyoCampaignId" TEXT NOT NULL,
    "klaviyoTemplateId" TEXT NOT NULL,
    "klaviyoMessageId" TEXT,
    "campaignName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft_created',
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KlaviyoDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KlaviyoDraft_briefId_createdAt_idx" ON "KlaviyoDraft"("briefId", "createdAt");

-- CreateIndex
CREATE INDEX "KlaviyoDraft_status_createdAt_idx" ON "KlaviyoDraft"("status", "createdAt");

-- CreateIndex
CREATE INDEX "KlaviyoDraft_klaviyoCampaignId_idx" ON "KlaviyoDraft"("klaviyoCampaignId");

-- CreateIndex
CREATE INDEX "KlaviyoDraft_klaviyoTemplateId_idx" ON "KlaviyoDraft"("klaviyoTemplateId");

-- AddForeignKey
ALTER TABLE "KlaviyoDraft" ADD CONSTRAINT "KlaviyoDraft_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "CampaignBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
