-- CreateTable
CREATE TABLE "CampaignPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dateRangeStart" TIMESTAMP(3) NOT NULL,
    "dateRangeEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "summary" TEXT,
    "strategyNotes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "campaignType" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "suggestedSendDate" TIMESTAMP(3) NOT NULL,
    "subjectLineAngle" TEXT,
    "primaryProduct" TEXT,
    "why" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignPlan_status_createdAt_idx" ON "CampaignPlan"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignPlan_dateRangeStart_dateRangeEnd_idx" ON "CampaignPlan"("dateRangeStart", "dateRangeEnd");

-- CreateIndex
CREATE INDEX "CampaignPlanItem_planId_suggestedSendDate_idx" ON "CampaignPlanItem"("planId", "suggestedSendDate");

-- CreateIndex
CREATE INDEX "CampaignPlanItem_campaignType_idx" ON "CampaignPlanItem"("campaignType");

-- CreateIndex
CREATE INDEX "CampaignPlanItem_status_idx" ON "CampaignPlanItem"("status");

-- AddForeignKey
ALTER TABLE "CampaignPlanItem" ADD CONSTRAINT "CampaignPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CampaignPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
