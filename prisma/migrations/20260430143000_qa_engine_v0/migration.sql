-- CreateTable
CREATE TABLE "BriefQaCheck" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "issues" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "passedChecks" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BriefQaCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BriefQaCheck_briefId_createdAt_idx" ON "BriefQaCheck"("briefId", "createdAt");

-- CreateIndex
CREATE INDEX "BriefQaCheck_status_createdAt_idx" ON "BriefQaCheck"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "BriefQaCheck" ADD CONSTRAINT "BriefQaCheck_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "CampaignBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
