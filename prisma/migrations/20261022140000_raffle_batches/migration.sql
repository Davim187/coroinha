CREATE TABLE "RaffleBatch" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "blockCount" INTEGER NOT NULL,
    "miniBlockSize" INTEGER NOT NULL,
    "firstNumber" INTEGER NOT NULL,
    "firstBlock" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleBatch_pkey" PRIMARY KEY ("id")
);

INSERT INTO "RaffleBatch" ("id", "campaignId", "blockCount", "miniBlockSize", "firstNumber", "firstBlock", "createdAt")
SELECT 'batch_' || "id", "id", "blockCount", "miniBlockSize", "firstNumber", "firstBlock", "createdAt"
FROM "RaffleCampaign";

ALTER TABLE "RaffleBlock" ADD COLUMN "batchId" TEXT;

UPDATE "RaffleBlock" AS block
SET "batchId" = 'batch_' || block."campaignId";

ALTER TABLE "RaffleBlock" ALTER COLUMN "batchId" SET NOT NULL;

CREATE INDEX "RaffleBatch_campaignId_idx" ON "RaffleBatch"("campaignId");
CREATE INDEX "RaffleBlock_batchId_idx" ON "RaffleBlock"("batchId");

ALTER TABLE "RaffleBatch" ADD CONSTRAINT "RaffleBatch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "RaffleCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RaffleBlock" ADD CONSTRAINT "RaffleBlock_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RaffleBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RaffleBatch" ADD CONSTRAINT "RaffleBatch_split_check" CHECK ("blockCount" > 0 AND "miniBlockSize" >= 1 AND "miniBlockSize" <= 10 AND "firstNumber" > 0 AND "firstBlock" > 0);
