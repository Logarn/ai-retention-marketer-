-- CreateTable
CREATE TABLE "CampaignBrief" (
    "id" TEXT NOT NULL,
    "planItemId" TEXT,
    "title" TEXT NOT NULL,
    "campaignType" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "subjectLines" JSONB NOT NULL,
    "previewTexts" JSONB NOT NULL,
    "angle" TEXT NOT NULL,
    "primaryProduct" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "designNotes" TEXT,
    "cta" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignBriefSection" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "heading" TEXT,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignBriefSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignBrief_planItemId_idx" ON "CampaignBrief"("planItemId");

-- CreateIndex
CREATE INDEX "CampaignBrief_status_createdAt_idx" ON "CampaignBrief"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignBrief_campaignType_idx" ON "CampaignBrief"("campaignType");

-- CreateIndex
CREATE INDEX "CampaignBrief_segment_idx" ON "CampaignBrief"("segment");

-- CreateIndex
CREATE INDEX "CampaignBriefSection_briefId_sortOrder_idx" ON "CampaignBriefSection"("briefId", "sortOrder");

-- CreateIndex
CREATE INDEX "CampaignBriefSection_type_idx" ON "CampaignBriefSection"("type");

-- AddForeignKey
ALTER TABLE "CampaignBrief" ADD CONSTRAINT "CampaignBrief_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "CampaignPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBriefSection" ADD CONSTRAINT "CampaignBriefSection_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "CampaignBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
