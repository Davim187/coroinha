ALTER TABLE "RaffleCampaign" ADD COLUMN "blockCount" INTEGER;
ALTER TABLE "RaffleCampaign" ADD COLUMN "miniBlockSize" INTEGER NOT NULL DEFAULT 10;

UPDATE "RaffleCampaign"
SET "blockCount" = CASE
  WHEN "totalNumbers" % 10 = 0 THEN "totalNumbers" / 10
  ELSE GREATEST(1, ("totalNumbers" + 9) / 10)
END
WHERE "blockCount" IS NULL;

ALTER TABLE "RaffleCampaign" ALTER COLUMN "blockCount" SET NOT NULL;

ALTER TABLE "RaffleCampaign" ADD CONSTRAINT "RaffleCampaign_block_split_check" CHECK ("blockCount" > 0 AND "miniBlockSize" >= 1 AND "miniBlockSize" <= 10 AND "totalNumbers" = "blockCount" * 10);
