ALTER TABLE "RaffleCampaign" ADD COLUMN "firstNumber" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "RaffleCampaign" ADD CONSTRAINT "RaffleCampaign_first_number_check" CHECK ("firstNumber" > 0);
