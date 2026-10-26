ALTER TABLE "RaffleCampaign" ADD COLUMN "firstBlock" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "RaffleCampaign" ADD CONSTRAINT "RaffleCampaign_first_block_check" CHECK ("firstBlock" > 0);
