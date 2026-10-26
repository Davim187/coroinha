ALTER TABLE "RaffleCampaign" DROP CONSTRAINT "RaffleCampaign_block_split_check";

ALTER TABLE "RaffleCampaign" ADD CONSTRAINT "RaffleCampaign_block_split_check" CHECK ("blockCount" > 0 AND "miniBlockSize" >= 1 AND "miniBlockSize" <= 10 AND "totalNumbers" > 0 AND "totalNumbers" % 10 = 0);
